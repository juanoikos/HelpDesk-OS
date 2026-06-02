package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yusufpapurcu/wmi"
)

// ── Estructuras WMI ──────────────────────────────────────────────────────────

type Win32_OperatingSystem struct {
	Caption        string
	BuildNumber    string
	Version        string
	OSArchitecture string
}

type Win32_Processor struct {
	Name                      string
	NumberOfCores             uint32
	NumberOfLogicalProcessors uint32
	MaxClockSpeed             uint32
	ProcessorId               string
}

type Win32_PhysicalMemory struct {
	Capacity     uint64
	Manufacturer string
	PartNumber   string
	SerialNumber string
	Speed        uint32
}

type Win32_DiskDrive struct {
	Model        string
	Size         uint64
	SerialNumber string
	MediaType    string
	InterfaceType string
}

type Win32_BaseBoard struct {
	Manufacturer string
	Product      string
	SerialNumber string
	Version      string
}

type Win32_BIOS struct {
	Manufacturer     string
	SMBIOSBIOSVersion string
	SerialNumber     string
}

type Win32_VideoController struct {
	Name          string
	AdapterRAM    uint32
	DriverVersion string
}

type Win32_NetworkAdapterConfiguration struct {
	IPAddress   []string
	MACAddress  string
	IPEnabled   bool
	DefaultIPGateway []string
}

type Win32_PnPEntity struct {
	Name      string
	PNPClass  string
	Status    string
}

type Win32_SystemEnclosure struct {
	ChassisTypes []uint16
}

// ── Payload para la API ──────────────────────────────────────────────────────

type HardwarePayload struct {
	Hostname     string      `json:"hostname"`
	Username     string      `json:"username"`
	IPAddress    string      `json:"ipAddress"`
	MACAddress   string      `json:"macAddress"`
	OSName       string      `json:"osName"`
	CPU          string      `json:"cpu"`
	RAMGB        int         `json:"ramGB"`
	DiskInfo     string      `json:"diskInfo"`
	Motherboard  string      `json:"motherboard"`
	AgentVersion string      `json:"agentVersion"`
	AssetType    string      `json:"assetType"`
	HardwareData interface{} `json:"hardwareData"`
}

type APIResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

const VERSION = "2.0.0"

// ── Utilidades ───────────────────────────────────────────────────────────────

func roundGB(bytes uint64) int {
	return int(math.Round(float64(bytes) / (1024 * 1024 * 1024)))
}

func roundMB(bytes uint32) int {
	return int(math.Round(float64(bytes) / (1024 * 1024)))
}

func printStep(step, total int, desc string) {
	fmt.Printf("  [%d/%d] %s\n", step, total, desc)
}

func printOK(msg string) {
	fmt.Printf("  \033[32m✓\033[0m  %s\n", msg)
}

func printErr(msg string) {
	fmt.Printf("  \033[31m✗\033[0m  %s\n", msg)
}

// ── Leer configuración desde archivo ─────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	// Banderas de línea de comandos
	tokenFlag  := flag.String("token",  "", "Token de la empresa")
	serverFlag := flag.String("server", "", "URL del servidor HelpDesk OS")
	flag.Parse()

	// Leer config del archivo si existe
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

	// Validar
	if token == "" || server == "" {
		fmt.Println("\n  ERROR: Falta el token o la URL del servidor.")
		fmt.Println("  Uso: helpdesk-agent.exe --token TOKEN --server URL")
		fmt.Println("  O crea un archivo helpdesk.conf con token=... y server=...")
		fmt.Println("\n  Presiona Enter para salir...")
		fmt.Scanln()
		os.Exit(1)
	}

	// Banner
	fmt.Println()
	fmt.Println("  \033[36m╔══════════════════════════════════════════╗\033[0m")
	fmt.Println("  \033[36m║   HelpDesk OS — Agente de inventario     ║\033[0m")
	fmt.Printf("  \033[36m║   Versión %-31s║\033[0m\n", VERSION)
	fmt.Println("  \033[36m╚══════════════════════════════════════════╝\033[0m")
	fmt.Println()

	payload := &HardwarePayload{
		Hostname:     os.Getenv("COMPUTERNAME"),
		Username:     os.Getenv("USERNAME"),
		AgentVersion: VERSION,
	}
	hw := map[string]interface{}{}

	// ── [1/8] Sistema Operativo ──
	printStep(1, 8, "Sistema operativo...")
	var osInfo []Win32_OperatingSystem
	if err := wmi.Query("SELECT Caption, BuildNumber, Version, OSArchitecture FROM Win32_OperatingSystem", &osInfo); err == nil && len(osInfo) > 0 {
		o := osInfo[0]
		payload.OSName = fmt.Sprintf("%s build %s", o.Caption, o.BuildNumber)
		hw["os"] = map[string]string{
			"name":    o.Caption,
			"version": o.Version,
			"build":   o.BuildNumber,
			"arch":    o.OSArchitecture,
		}
	}

	// ── [2/8] Procesador ──
	printStep(2, 8, "Procesador...")
	var cpus []Win32_Processor
	if err := wmi.Query("SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, ProcessorId FROM Win32_Processor", &cpus); err == nil && len(cpus) > 0 {
		c := cpus[0]
		ghz := math.Round(float64(c.MaxClockSpeed)/100) / 10
		payload.CPU = fmt.Sprintf("%s - %d nucleos a %.1f GHz", strings.TrimSpace(c.Name), c.NumberOfCores, ghz)
		hw["cpu"] = map[string]interface{}{
			"name":    strings.TrimSpace(c.Name),
			"cores":   c.NumberOfCores,
			"threads": c.NumberOfLogicalProcessors,
			"mhz":     c.MaxClockSpeed,
			"id":      c.ProcessorId,
		}
	}

	// ── [3/8] Memoria RAM ──
	printStep(3, 8, "Memoria RAM...")
	var ramModules []Win32_PhysicalMemory
	if err := wmi.Query("SELECT Capacity, Manufacturer, PartNumber, SerialNumber, Speed FROM Win32_PhysicalMemory", &ramModules); err == nil {
		var totalBytes uint64
		var ramData []map[string]interface{}
		for _, m := range ramModules {
			totalBytes += m.Capacity
			ramData = append(ramData, map[string]interface{}{
				"sizeGB":       roundGB(m.Capacity),
				"manufacturer": strings.TrimSpace(m.Manufacturer),
				"partNumber":   strings.TrimSpace(m.PartNumber),
				"serial":       strings.TrimSpace(m.SerialNumber),
				"speed":        m.Speed,
			})
		}
		payload.RAMGB = roundGB(totalBytes)
		hw["ram"] = ramData
	}

	// ── [4/8] Discos ──
	printStep(4, 8, "Discos y almacenamiento...")
	var disks []Win32_DiskDrive
	if err := wmi.Query("SELECT Model, Size, SerialNumber, MediaType, InterfaceType FROM Win32_DiskDrive", &disks); err == nil && len(disks) > 0 {
		d := disks[0]
		sizeGB := roundGB(d.Size)
		payload.DiskInfo = fmt.Sprintf("%s %d GB", strings.TrimSpace(d.Model), sizeGB)
		var diskData []map[string]interface{}
		for _, disk := range disks {
			diskData = append(diskData, map[string]interface{}{
				"model":      strings.TrimSpace(disk.Model),
				"sizeGB":     roundGB(disk.Size),
				"serial":     strings.TrimSpace(disk.SerialNumber),
				"mediaType":  disk.MediaType,
				"interface":  disk.InterfaceType,
			})
		}
		hw["disks"] = diskData
	}

	// ── [5/8] Placa madre y BIOS ──
	printStep(5, 8, "Placa madre y BIOS...")
	var boards []Win32_BaseBoard
	if err := wmi.Query("SELECT Manufacturer, Product, SerialNumber, Version FROM Win32_BaseBoard", &boards); err == nil && len(boards) > 0 {
		b := boards[0]
		payload.Motherboard = fmt.Sprintf("%s %s", strings.TrimSpace(b.Manufacturer), strings.TrimSpace(b.Product))
		hw["motherboard"] = map[string]string{
			"manufacturer": strings.TrimSpace(b.Manufacturer),
			"product":      strings.TrimSpace(b.Product),
			"serial":       strings.TrimSpace(b.SerialNumber),
			"version":      b.Version,
		}
	}
	var biosInfo []Win32_BIOS
	if err := wmi.Query("SELECT Manufacturer, SMBIOSBIOSVersion, SerialNumber FROM Win32_BIOS", &biosInfo); err == nil && len(biosInfo) > 0 {
		b := biosInfo[0]
		hw["bios"] = map[string]string{
			"manufacturer": b.Manufacturer,
			"version":      b.SMBIOSBIOSVersion,
			"serial":       strings.TrimSpace(b.SerialNumber),
		}
	}

	// ── [6/8] Tarjeta gráfica ──
	printStep(6, 8, "Tarjeta grafica...")
	var gpus []Win32_VideoController
	if err := wmi.Query("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController", &gpus); err == nil {
		var gpuData []map[string]interface{}
		for _, g := range gpus {
			gpuData = append(gpuData, map[string]interface{}{
				"name":   g.Name,
				"vramMB": roundMB(g.AdapterRAM),
				"driver": g.DriverVersion,
			})
		}
		hw["gpu"] = gpuData
	}

	// ── [7/8] Red ──
	printStep(7, 8, "Red...")
	var adapters []Win32_NetworkAdapterConfiguration
	if err := wmi.Query("SELECT IPAddress, MACAddress, IPEnabled, DefaultIPGateway FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE", &adapters); err == nil {
		for _, a := range adapters {
			if len(a.DefaultIPGateway) > 0 && len(a.IPAddress) > 0 {
				payload.IPAddress = a.IPAddress[0]
				payload.MACAddress = a.MACAddress
				hw["network"] = map[string]string{
					"ip":  a.IPAddress[0],
					"mac": a.MACAddress,
				}
				break
			}
		}
	}

	// ── [8/8] Dispositivos USB ──
	printStep(8, 8, "Dispositivos USB...")
	var pnpDevices []Win32_PnPEntity
	if err := wmi.Query("SELECT Name, PNPClass, Status FROM Win32_PnPEntity WHERE PNPClass = 'HIDClass' OR PNPClass = 'USB' OR PNPClass = 'Keyboard' OR PNPClass = 'Mouse' OR PNPClass = 'Printer'", &pnpDevices); err == nil {
		var usbData []map[string]string
		for _, d := range pnpDevices {
			if d.Name != "" {
				usbData = append(usbData, map[string]string{
					"name":   d.Name,
					"class":  d.PNPClass,
					"status": d.Status,
				})
			}
		}
		hw["usb"] = usbData
	}

	// ── Tipo de equipo ──
	var enclosures []Win32_SystemEnclosure
	payload.AssetType = "DESKTOP"
	if err := wmi.Query("SELECT ChassisTypes FROM Win32_SystemEnclosure", &enclosures); err == nil && len(enclosures) > 0 {
		for _, ct := range enclosures[0].ChassisTypes {
			if ct == 8 || ct == 9 || ct == 10 || ct == 11 || ct == 12 || ct == 14 || ct == 18 || ct == 21 {
				payload.AssetType = "LAPTOP"
				break
			}
		}
	}

	payload.HardwareData = hw

	// ── Enviar al servidor ──
	fmt.Println()
	fmt.Println("  Enviando inventario a HelpDesk OS...")

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		printErr("Error al serializar los datos: " + err.Error())
		waitAndExit(1)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", server+"/api/agent/inventory", bytes.NewReader(jsonBytes))
	if err != nil {
		printErr("Error al crear la solicitud: " + err.Error())
		waitAndExit(1)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		printErr("Error de conexion: " + err.Error())
		fmt.Println("  Verifica que el servidor este disponible y tengas internet.")
		waitAndExit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		printErr(fmt.Sprintf("El servidor respondio con error %d", resp.StatusCode))
		waitAndExit(1)
	}

	var apiResp APIResponse
	json.NewDecoder(resp.Body).Decode(&apiResp)

	fmt.Println()
	fmt.Println("  \033[32m╔══════════════════════════════════════════╗\033[0m")
	fmt.Println("  \033[32m║   ✓  Inventario registrado correctamente ║\033[0m")
	fmt.Println("  \033[32m╚══════════════════════════════════════════╝\033[0m")
	fmt.Println()
	fmt.Printf("  Equipo  : %s\n", payload.Hostname)
	fmt.Printf("  Usuario : %s\n", payload.Username)
	fmt.Printf("  CPU     : %s\n", payload.CPU)
	fmt.Printf("  RAM     : %d GB\n", payload.RAMGB)
	fmt.Printf("  Disco   : %s\n", payload.DiskInfo)
	fmt.Printf("  Tipo    : %s\n", payload.AssetType)
	fmt.Printf("  ID      : %s\n", apiResp.ID)
	fmt.Println()

	waitAndExit(0)
}

func waitAndExit(code int) {
	fmt.Println("  Presiona Enter para cerrar...")
	fmt.Scanln()
	os.Exit(code)
}
