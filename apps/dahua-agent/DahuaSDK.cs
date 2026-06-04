using System;
using System.Runtime.InteropServices;

namespace DahuaAgent
{
    // ─── Estructuras del SDK ────────────────────────────────────────────────────

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct NET_TIME
    {
        public uint dwYear;
        public uint dwMonth;
        public uint dwDay;
        public uint dwHour;
        public uint dwMinute;
        public uint dwSecond;

        public NET_TIME(int year, int month, int day, int hour, int minute, int second)
        {
            dwYear = (uint)year; dwMonth = (uint)month; dwDay = (uint)day;
            dwHour = (uint)hour; dwMinute = (uint)minute; dwSecond = (uint)second;
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct NET_DEVICEINFO
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string sSerialNumber;
        public int     nAlarmInPortNum;
        public int     nAlarmOutPortNum;
        public int     nDiskNum;
        public int     nDVRType;
        public int     nChanNum;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string byMacAddr;
        public short   wHttpPort;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 2)]
        public byte[]  byIPVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szIPv6Address;
        public int     nLoginType;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 116)]
        public byte[]  byReserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct NET_RECORDFILE_INFO
    {
        public uint   ch;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 124)]
        public string filename;
        public uint   frameRate;
        public uint   size;
        public NET_TIME starttime;
        public NET_TIME endtime;
        public uint   driveno;
        public uint   startcluster;
        public byte   nRecordFileType;
        public byte   bImportantRecID;
        public byte   bHint;
        public byte   bRecType;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 36)]
        public byte[] reserved;
    }

    // ─── P2P Login structures ────────────────────────────────────────────────────

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct NET_IN_LOGINBY_SERIAL_NO
    {
        public uint   dwSize;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string szDevSerialNo;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szUserName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szPassword;
        public ushort nPort;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 128)]
        public byte[] byReserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct NET_OUT_LOGINBY_SERIAL_NO
    {
        public uint         dwSize;
        public NET_DEVICEINFO stuDeviceInfo;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 128)]
        public byte[]       byReserved;
    }

    // ─── P/Invoke al dhnetsdk.dll ────────────────────────────────────────────────

    public static class DahuaSDKNative
    {
        // La DLL se carga desde la ruta configurada en config.json
        // Se copia al directorio del ejecutable antes de inicializar

        public delegate void fDisConnect(IntPtr lLoginID, string pchDVRIP, long nDVRPort, IntPtr dwUser);
        public delegate void fHaveReConnect(IntPtr lLoginID, string pchDVRIP, long nDVRPort, IntPtr dwUser);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern bool CLIENT_Init(fDisConnect cbDisConnect, IntPtr dwUser);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern void CLIENT_Cleanup();

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern IntPtr CLIENT_Login(
            [MarshalAs(UnmanagedType.LPStr)] string szIP,
            ushort wPort,
            [MarshalAs(UnmanagedType.LPStr)] string szUserName,
            [MarshalAs(UnmanagedType.LPStr)] string szPassword,
            ref NET_DEVICEINFO lpDeviceInfo,
            ref int nError);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern IntPtr CLIENT_LoginBySerialNo(
            ref NET_IN_LOGINBY_SERIAL_NO pInParam,
            ref NET_OUT_LOGINBY_SERIAL_NO pOutParam,
            int nWaitTime);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern bool CLIENT_Logout(IntPtr lLoginID);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern bool CLIENT_QueryRecordFile(
            IntPtr lLoginID,
            int nChannelId,
            int nRecordFileType,
            ref NET_TIME tmStart,
            ref NET_TIME tmEnd,
            [MarshalAs(UnmanagedType.LPStr)] string? szCardid,
            IntPtr nriFileinfo,
            int nFileCount,
            ref int pFileCounts,
            int nWaitTime,
            bool bTime);

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern uint CLIENT_GetLastError();

        [DllImport("dhnetsdk.dll", CallingConvention = CallingConvention.StdCall)]
        public static extern void CLIENT_SetConnectTime(uint nWaitTime, uint nTryTimes);
    }
}
