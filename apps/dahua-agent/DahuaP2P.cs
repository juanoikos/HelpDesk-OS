using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;

namespace DahuaAgent
{
    /// <summary>
    /// Implementación del protocolo Easy4IP de Dahua para descubrir la IP de un DVR via serial.
    /// Basado en investigación del protocolo P2P de Dahua (puerto UDP 3000).
    /// </summary>
    public static class DahuaP2P
    {
        private static readonly string[] P2P_SERVERS = {
            "dev.easy4ip.com",
            "us.easy4ip.com",
            "eu.easy4ip.com",
        };
        private const int P2P_PORT    = 3000;
        private const int TIMEOUT_MS  = 8000;

        /// <summary>
        /// Resuelve la IP actual de un DVR usando su número de serie via P2P cloud.
        /// Retorna (ip, port) si lo encuentra, o null si no.
        /// </summary>
        public static async Task<(string ip, int port)?> ResolveAsync(string serial)
        {
            foreach (var server in P2P_SERVERS)
            {
                try
                {
                    var result = await QueryServerAsync(server, serial);
                    if (result.HasValue)
                        return result;
                }
                catch { /* intentar siguiente servidor */ }
            }
            return null;
        }

        private static async Task<(string ip, int port)?> QueryServerAsync(string server, string serial)
        {
            using var udp = new UdpClient();
            udp.Client.ReceiveTimeout = TIMEOUT_MS;

            var endpoint = new IPEndPoint(
                (await Dns.GetHostAddressesAsync(server))[0],
                P2P_PORT
            );

            // Packet de consulta P2P Dahua Easy4IP
            var packet = BuildQueryPacket(serial);
            await udp.SendAsync(packet, packet.Length, endpoint);

            // Esperar respuesta
            var cts      = new System.Threading.CancellationTokenSource(TIMEOUT_MS);
            var recvTask = udp.ReceiveAsync();

            if (await Task.WhenAny(recvTask, Task.Delay(TIMEOUT_MS)) == recvTask)
            {
                var response = recvTask.Result;
                return ParseResponse(response.Buffer);
            }

            return null;
        }

        /// <summary>
        /// Construye el paquete UDP de consulta al servidor P2P de Dahua.
        /// Formato documentado por investigadores de seguridad (Paul Marrapese et al.)
        /// </summary>
        private static byte[] BuildQueryPacket(string serial)
        {
            // Header del protocolo Easy4IP
            // Magic: 0xF1 0x00 + tipo + longitud + serial + relleno
            var serialBytes = Encoding.ASCII.GetBytes(serial);
            var buf = new System.Collections.Generic.List<byte>();

            // Magic header Dahua P2P
            buf.AddRange(new byte[] { 0xF1, 0x00, 0x00, 0x00 });  // magic
            buf.AddRange(new byte[] { 0x00, 0x00, 0x00, 0x01 });  // tipo: query
            buf.AddRange(BitConverter.GetBytes((ushort)serialBytes.Length)); // longitud serial
            buf.AddRange(new byte[] { 0x00, 0x00 });               // relleno
            buf.AddRange(serialBytes);                              // serial ASCII
            // Padding hasta 64 bytes total mínimo
            while (buf.Count < 64) buf.Add(0x00);

            return buf.ToArray();
        }

        /// <summary>
        /// Parsea la respuesta UDP del servidor P2P para extraer IP y puerto del DVR.
        /// </summary>
        private static (string ip, int port)? ParseResponse(byte[] data)
        {
            if (data == null || data.Length < 20) return null;

            try
            {
                // El servidor responde con la IP del DVR en los bytes 8-11 (big-endian)
                // y el puerto en bytes 12-13 (big-endian)
                // Formato aproximado según investigación del protocolo

                // Intentar extraer IP de la respuesta
                // La respuesta puede venir en distintos offsets según versión del servidor
                for (int offset = 4; offset <= data.Length - 6; offset += 2)
                {
                    // Buscar patrón de IP válida (no 0.0.0.0 ni 255.255.255.255)
                    byte b0 = data[offset], b1 = data[offset+1],
                         b2 = data[offset+2], b3 = data[offset+3];

                    if (b0 > 0 && b0 < 255 && b1 > 0 && b2 > 0 && b3 > 0)
                    {
                        string ip   = $"{b0}.{b1}.{b2}.{b3}";
                        int    port = (data[offset+4] << 8) | data[offset+5];

                        // Validar que el puerto tiene sentido (1024-65535)
                        if (port >= 1024 && port <= 65535)
                            return (ip, port);
                    }
                }
            }
            catch { }

            return null;
        }
    }
}
