package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const VERSION = "1.0.0"

// ── Estructuras ───────────────────────────────────────────────────────────────

type DeviceResult struct {
	IP         string `json:"ip"`
	MAC        string `json:"mac,omitempty"`
	Vendor     string `json:"vendor,omitempty"`
	Hostname   string `json:"hostname,omitempty"`
	DeviceType string `json:"deviceType"`
	OpenPorts  []int  `json:"openPorts"`
	HTTPTitle  string `json:"httpTitle,omitempty"`
	ONVIF      bool   `json:"onvif"`
}

type ScanPayload struct {
	ScannedFrom  string         `json:"scannedFrom"`
	Subnet       string         `json:"subnet"`
	ScanDuration int            `json:"scanDuration"`
	Devices      []DeviceResult `json:"devices"`
}

type APIResponse struct {
	ScanID      string `json:"scanId"`
	DeviceCount int    `json:"deviceCount"`
}

// ── Utilidades de terminal ─────────────────────────────────────────────────────

func printBanner() {
	fmt.Println()
	fmt.Println("  \033[36m╔══════════════════════════════════════════╗\033[0m")
	fmt.Println("  \033[36m║   HelpDesk OS — Scanner de Red           ║\033[0m")
	fmt.Printf("  \033[36m║   Versión %-31s║\033[0m\n", VERSION)
	fmt.Println("  \033[36m╚══════════════════════════════════════════╝\033[0m")
	fmt.Println()
}

func printStep(msg string) {
	fmt.Printf("  \033[33m▶\033[0m  %s\n", msg)
}

func printOK(msg string) {
	fmt.Printf("  \033[32m✓\033[0m  %s\n", msg)
}

func printErr(msg string) {
	fmt.Printf("  \033[31m✗\033[0m  %s\n", msg)
}

func printInfo(msg string) {
	fmt.Printf("      \033[90m%s\033[0m\n", msg)
}

// ── Leer configuración desde archivo ──────────────────────────────────────────

func readConfig(path string) map[string]string {
	cfg := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return cfg
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			cfg[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return cfg
}

// ── Detección automática de subred ────────────────────────────────────────────

func detectSubnet() (string, string, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "", "", err
	}

	for _, iface := range ifaces {
		// Ignorar loopback y no activos
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if iface.Flags&net.FlagUp == 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			var ip net.IP
			var mask net.IPMask

			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
				mask = v.Mask
			case *net.IPAddr:
				ip = v.IP
			}

			if ip == nil || ip.IsLoopback() {
				continue
			}

			ip4 := ip.To4()
			if ip4 == nil {
				continue
			}

			// Construir subred /24
			subnet := fmt.Sprintf("%d.%d.%d.0/24", ip4[0], ip4[1], ip4[2])
			_ = mask

			return subnet, ip4.String(), nil
		}
	}

	return "", "", fmt.Errorf("no se encontró interfaz de red activa")
}

// ── Ping sweep paralelo ───────────────────────────────────────────────────────

func pingIP(ip string) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:80", ip), 300*time.Millisecond)
	if err == nil {
		conn.Close()
		return true
	}
	// Intentar con ICMP simulado vía TCP en varios puertos comunes
	for _, port := range []int{443, 22, 554, 8000, 8080} {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, port), 300*time.Millisecond)
		if err == nil {
			conn.Close()
			return true
		}
	}
	return false
}

func pingSweep(subnet string) []string {
	// Extraer los 3 primeros octetos
	parts := strings.Split(subnet, ".")
	if len(parts) < 3 {
		return nil
	}
	prefix := strings.Join(parts[:3], ".")

	sem := make(chan struct{}, 50)
	var mu sync.Mutex
	var alive []string
	var wg sync.WaitGroup

	total := 254
	done := 0
	var progressMu sync.Mutex

	for i := 1; i <= total; i++ {
		wg.Add(1)
		go func(last int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ip := fmt.Sprintf("%s.%d", prefix, last)
			if pingIP(ip) {
				mu.Lock()
				alive = append(alive, ip)
				mu.Unlock()
			}

			progressMu.Lock()
			done++
			if done%50 == 0 || done == total {
				fmt.Printf("      Progreso: %d/%d IPs escaneadas...\r", done, total)
			}
			progressMu.Unlock()
		}(i)
	}

	wg.Wait()
	fmt.Println()
	return alive
}

// ── Tabla ARP ─────────────────────────────────────────────────────────────────

var arpMACRe = regexp.MustCompile(`([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}`)

func parseARPTable() map[string]string {
	result := map[string]string{}

	out, err := exec.Command("arp", "-a").Output()
	if err != nil {
		return result
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Formato Windows: "  192.168.1.1          aa-bb-cc-dd-ee-ff     dynamic"
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		ip := fields[0]
		mac := fields[1]

		if net.ParseIP(ip) == nil {
			continue
		}

		if !arpMACRe.MatchString(mac) {
			continue
		}

		// Normalizar: aa-bb-cc-dd-ee-ff → AA:BB:CC:DD:EE:FF
		mac = strings.ToUpper(strings.ReplaceAll(mac, "-", ":"))
		result[ip] = mac
	}

	return result
}

// ── Vendor lookup ─────────────────────────────────────────────────────────────

func lookupVendor(mac string) string {
	if mac == "" {
		return ""
	}

	// Usar solo los primeros 3 octetos (OUI)
	parts := strings.Split(mac, ":")
	if len(parts) < 3 {
		return ""
	}
	oui := strings.Join(parts[:3], ":")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("https://api.macvendors.com/%s", oui))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return ""
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	vendor := strings.TrimSpace(string(body))
	if strings.Contains(vendor, "errors") || vendor == "" {
		return ""
	}

	return vendor
}

// ── Port scanner ──────────────────────────────────────────────────────────────

var targetPorts = []int{80, 443, 22, 23, 554, 8000, 8080, 8443, 37777, 34567, 5000, 9000, 4567}

func scanPorts(ip string) []int {
	var open []int
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, port := range targetPorts {
		wg.Add(1)
		go func(p int) {
			defer wg.Done()
			conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip, p), 300*time.Millisecond)
			if err == nil {
				conn.Close()
				mu.Lock()
				open = append(open, p)
				mu.Unlock()
			}
		}(port)
	}

	wg.Wait()
	return open
}

// ── HTTP title ────────────────────────────────────────────────────────────────

var titleRe = regexp.MustCompile(`(?i)<title[^>]*>([^<]{1,100})</title>`)

func getHTTPTitle(ip string, openPorts []int) string {
	hasPort := func(p int) bool {
		for _, op := range openPorts {
			if op == p {
				return true
			}
		}
		return false
	}

	for _, scheme := range []struct {
		port int
		url  string
	}{
		{80, fmt.Sprintf("http://%s/", ip)},
		{8080, fmt.Sprintf("http://%s:8080/", ip)},
		{8000, fmt.Sprintf("http://%s:8000/", ip)},
		{443, fmt.Sprintf("https://%s/", ip)},
	} {
		if !hasPort(scheme.port) {
			continue
		}

		client := &http.Client{
			Timeout: 3 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}

		resp, err := client.Get(scheme.url)
		if err != nil {
			continue
		}

		body := make([]byte, 4096)
		n, _ := resp.Body.Read(body)
		resp.Body.Close()

		if n > 0 {
			m := titleRe.FindSubmatch(body[:n])
			if m != nil {
				title := strings.TrimSpace(string(m[1]))
				if title != "" {
					return title
				}
			}
		}
	}

	return ""
}

// ── Clasificación de dispositivos ─────────────────────────────────────────────

func classifyDevice(vendor string, openPorts []int, onvif bool) string {
	v := strings.ToLower(vendor)

	hasPort := func(p int) bool {
		for _, op := range openPorts {
			if op == p {
				return true
			}
		}
		return false
	}

	// ONVIF siempre es cámara
	if onvif {
		return "ip_camera"
	}

	// Hikvision
	if strings.Contains(v, "hikvision") {
		if hasPort(8000) {
			return "dvr_hikvision"
		}
		if hasPort(554) {
			return "ip_camera"
		}
		return "dvr_nvr"
	}

	// Dahua
	if strings.Contains(v, "dahua") {
		if hasPort(37777) {
			return "dvr_dahua"
		}
		if hasPort(554) {
			return "ip_camera"
		}
		return "dvr_nvr"
	}

	// Otras marcas de videovigilancia
	for _, cam := range []string{"uniview", "hanwha", "axis", "reolink", "annke", "amcrest", "foscam", "vivotek", "bosch security"} {
		if strings.Contains(v, cam) {
			return "ip_camera"
		}
	}

	// Puertos de videovigilancia
	if hasPort(37777) {
		return "dvr_dahua"
	}
	if hasPort(34567) {
		return "dvr_nvr"
	}
	if hasPort(554) {
		return "ip_camera"
	}

	// Networking hardware
	for _, sw := range []string{"cisco", "juniper"} {
		if strings.Contains(v, sw) {
			return "switch"
		}
	}
	for _, rt := range []string{"mikrotik", "ubiquiti", "ubnt"} {
		if strings.Contains(v, rt) {
			return "router_ap"
		}
	}
	for _, rt := range []string{"tp-link", "tplink", "netgear", "asus", "d-link", "dlink", "tenda", "zyxel", "linksys", "belkin"} {
		if strings.Contains(v, rt) {
			return "router_ap"
		}
	}

	// Puerto 80 con título web
	if hasPort(80) || hasPort(8080) || hasPort(443) {
		return "web_device"
	}

	return "unknown"
}

// ── ONVIF WS-Discovery ────────────────────────────────────────────────────────

const onvifProbe = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:helpdesk-scanner-probe</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>`

func onvifDiscovery() map[string]bool {
	discovered := map[string]bool{}

	// Abrir socket UDP
	conn, err := net.ListenPacket("udp4", "0.0.0.0:0")
	if err != nil {
		return discovered
	}
	defer conn.Close()

	// Enviar multicast probe
	dst, _ := net.ResolveUDPAddr("udp4", "239.255.255.250:3702")
	conn.SetDeadline(time.Now().Add(3 * time.Second))
	conn.WriteTo([]byte(onvifProbe), dst)

	// Recolectar respuestas durante 3 segundos
	buf := make([]byte, 4096)
	ipRe := regexp.MustCompile(`(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})`)

	for {
		n, addr, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}

		// Extraer IP del remitente
		udpAddr, ok := addr.(*net.UDPAddr)
		if ok {
			discovered[udpAddr.IP.String()] = true
		}

		// También buscar IPs en el cuerpo de la respuesta
		matches := ipRe.FindAllString(string(buf[:n]), -1)
		for _, m := range matches {
			ip := net.ParseIP(m)
			if ip != nil && !ip.IsLoopback() {
				discovered[m] = true
			}
		}
	}

	return discovered
}

// ── Lookup de hostname ────────────────────────────────────────────────────────

func lookupHostname(ip string) string {
	names, err := net.LookupAddr(ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	h := strings.TrimSuffix(names[0], ".")
	return h
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	tokenFlag  := flag.String("token",  "", "Token de la empresa")
	serverFlag := flag.String("server", "", "URL del servidor HelpDesk OS")
	flag.Parse()

	exe, _ := os.Executable()
	cfgPath := filepath.Join(filepath.Dir(exe), "helpdesk.conf")
	cfg := readConfig(cfgPath)

	token := *tokenFlag
	if token == "" {
		token = cfg["token"]
	}
	server := *serverFlag
	if server == "" {
		server = cfg["server"]
	}

	if token == "" || server == "" {
		fmt.Println("\n  ERROR: Falta el token o la URL del servidor.")
		fmt.Println("  Uso: helpdesk-scanner.exe --token TOKEN --server URL")
		fmt.Println("  O crea un archivo helpdesk.conf con token=... y server=...")
		fmt.Println()
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}

	printBanner()

	hostname, _ := os.Hostname()
	startTime := time.Now()

	// ── [1] Detectar subred ──
	printStep("Detectando subred local...")
	subnet, localIP, err := detectSubnet()
	if err != nil {
		printErr("No se pudo detectar la subred: " + err.Error())
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}
	printOK(fmt.Sprintf("Subred detectada: %s (IP local: %s)", subnet, localIP))
	fmt.Println()

	// ── [2] ONVIF Discovery (en paralelo con el ping sweep) ──
	printStep("Iniciando ONVIF WS-Discovery...")
	var onvifIPs map[string]bool
	var onvifWg sync.WaitGroup
	onvifWg.Add(1)
	go func() {
		defer onvifWg.Done()
		onvifIPs = onvifDiscovery()
	}()

	// ── [3] Ping sweep ──
	printStep(fmt.Sprintf("Escaneando 254 IPs en %s...", subnet))
	fmt.Println()
	aliveIPs := pingSweep(subnet)

	// Esperar ONVIF
	onvifWg.Wait()

	// Agregar IPs de ONVIF que no estuvieran en el ping sweep
	aliveSet := map[string]bool{}
	for _, ip := range aliveIPs {
		aliveSet[ip] = true
	}
	for ip := range onvifIPs {
		if !aliveSet[ip] && ip != localIP {
			aliveIPs = append(aliveIPs, ip)
			aliveSet[ip] = true
		}
	}

	printOK(fmt.Sprintf("Encontrados %d dispositivos activos", len(aliveIPs)))
	if len(onvifIPs) > 0 {
		printInfo(fmt.Sprintf("ONVIF: %d dispositivos respondieron al probe", len(onvifIPs)))
	}
	fmt.Println()

	// ── [4] Leer tabla ARP ──
	printStep("Leyendo tabla ARP para obtener MAC addresses...")
	arpTable := parseARPTable()
	printOK(fmt.Sprintf("Tabla ARP: %d entradas", len(arpTable)))
	fmt.Println()

	// ── [5] Analizar cada dispositivo ──
	printStep(fmt.Sprintf("Analizando %d dispositivos (puertos, vendor, título HTTP)...", len(aliveIPs)))
	fmt.Println()

	var results []DeviceResult
	var resultsMu sync.Mutex

	for i, ip := range aliveIPs {
		fmt.Printf("  [%d/%d] %s", i+1, len(aliveIPs), ip)

		device := DeviceResult{
			IP:         ip,
			DeviceType: "unknown",
			OpenPorts:  []int{},
		}

		// MAC address
		if mac, ok := arpTable[ip]; ok {
			device.MAC = mac
		}

		// Hostname
		device.Hostname = lookupHostname(ip)

		// Port scan
		device.OpenPorts = scanPorts(ip)

		// ONVIF
		device.ONVIF = onvifIPs[ip]

		// Vendor lookup (con rate limiting)
		if device.MAC != "" {
			device.Vendor = lookupVendor(device.MAC)
			if device.Vendor != "" {
				fmt.Printf(" — %s", device.Vendor)
			}
			time.Sleep(500 * time.Millisecond) // Rate limit: 500ms entre llamadas
		}

		// HTTP title
		if len(device.OpenPorts) > 0 {
			device.HTTPTitle = getHTTPTitle(ip, device.OpenPorts)
		}

		// Clasificar
		device.DeviceType = classifyDevice(device.Vendor, device.OpenPorts, device.ONVIF)

		fmt.Printf(" [%s", device.DeviceType)
		if len(device.OpenPorts) > 0 {
			fmt.Printf(", puertos: %v", device.OpenPorts)
		}
		fmt.Println("]")

		resultsMu.Lock()
		results = append(results, device)
		resultsMu.Unlock()
	}

	if len(results) == 0 {
		fmt.Println()
		printErr("No se encontraron dispositivos en la red.")
		fmt.Println("  Presiona Enter para cerrar...")
		fmt.Scanln()
		os.Exit(0)
	}

	duration := int(time.Since(startTime).Seconds())

	// ── [6] Enviar resultados ──
	fmt.Println()
	printStep("Enviando resultados a HelpDesk OS...")

	payload := ScanPayload{
		ScannedFrom:  hostname,
		Subnet:       subnet,
		ScanDuration: duration,
		Devices:      results,
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		printErr("Error al serializar: " + err.Error())
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", server+"/api/agent/network-scan", bytes.NewReader(jsonBytes))
	if err != nil {
		printErr("Error al crear solicitud: " + err.Error())
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		printErr("Error de conexión: " + err.Error())
		fmt.Println("  Verifica que el servidor esté disponible.")
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		printErr(fmt.Sprintf("El servidor respondió con error %d", resp.StatusCode))
		fmt.Println("  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}

	var apiResp APIResponse
	json.NewDecoder(resp.Body).Decode(&apiResp)

	// ── Resumen final ──
	fmt.Println()
	fmt.Println("  \033[32m╔══════════════════════════════════════════╗\033[0m")
	fmt.Println("  \033[32m║   ✓  Scan completado correctamente       ║\033[0m")
	fmt.Println("  \033[32m╚══════════════════════════════════════════╝\033[0m")
	fmt.Println()
	fmt.Printf("  Subred      : %s\n", subnet)
	fmt.Printf("  Dispositivos: %d encontrados\n", len(results))
	fmt.Printf("  Duración    : %d segundos\n", duration)
	fmt.Printf("  Scan ID     : %s\n", apiResp.ScanID)
	fmt.Println()

	// Resumen por tipo
	typeCounts := map[string]int{}
	for _, d := range results {
		typeCounts[d.DeviceType]++
	}
	typeLabels := map[string]string{
		"dvr_nvr":       "DVR/NVR",
		"dvr_hikvision": "DVR Hikvision",
		"dvr_dahua":     "DVR Dahua",
		"ip_camera":     "Cámaras IP",
		"switch":        "Switches",
		"router_ap":     "Routers/AP",
		"web_device":    "Dispositivos web",
		"unknown":       "Desconocidos",
	}
	for dtype, count := range typeCounts {
		label := typeLabels[dtype]
		if label == "" {
			label = dtype
		}
		fmt.Printf("  %-20s: %d\n", label, count)
	}
	fmt.Println()

	fmt.Println("  Presiona Enter para cerrar...")
	fmt.Scanln()
}
