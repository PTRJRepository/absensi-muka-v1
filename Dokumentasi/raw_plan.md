{
  metadata: {
    name: "Configuration of Absensi Machine",
    version: "latest-from-screenshot",
    notes: [
      "scannerCode mengikuti mapping suffix_scanner_code terbaru",
      "locCode mengikuti mapping suffix_empcode terbaru",
      "machine IJL tidak punya scannerCode di mapping terbaru, hanya locCode = L",
      "Office_ARE tidak ada di mapping terbaru, perlu konfirmasi apakah seharusnya ARA atau kode baru ARE"
    ]
  },

  scannerCodes: {
    P1A: 100,
    ARC: 200,
    P1B: 300,
    AB2: 400,
    P2A: 500,
    P2B: 600,
    DME: 700,
    ARA: 800,
    AB1: 900
  },

  locCodes: {
    P1A: "A",
    P1B: "B",
    P2A: "C",
    P2B: "D",
    DME: "E",
    ARA: "F",
    AB1: "G",
    AB2: "H",
    ARC: "J",
    IJL: "L"
  },

  machines: [
    {
      no: 1,
      name: "Office PGE",
      code: "PGE",
      suffix: "PGE",
      ipLocal: "10.0.0.232",
      ipPublic: "223.25.98.220",
      port: 4370,
      scannerCode: null,
      locCode: null,
      type: "office"
    },
    {
      no: 2,
      name: "Mill",
      code: "MILL",
      suffix: "MILL",
      ipLocal: null,
      ipPublic: "103.127.66.32",
      port: 4370,
      scannerCode: null,
      locCode: null,
      type: "office"
    },
    {
      no: 3,
      name: "Absensi_DME_01",
      code: "DME_01",
      suffix: "DME",
      ipLocal: "192.168.1.10",
      ipPublic: "103.144.228.42",
      port: 4700,
      scannerCode: 700,
      locCode: "E",
      type: "absensi"
    },
    {
      no: 4,
      name: "Absensi Office_ARE",
      code: "ARE",
      suffix: "ARE",
      ipLocal: "192.168.1.233",
      ipPublic: "103.144.208.154",
      port: 4370,
      scannerCode: null,
      locCode: null,
      type: "absensi",
      warning: "Kode ARE belum ada di mapping terbaru. Konfirmasi apakah ini ARA atau kode baru."
    },
    {
      no: 5,
      name: "IJL",
      code: "IJL",
      suffix: "IJL",
      ipLocal: null,
      ipPublic: "103.144.211.226",
      port: 4370,
      scannerCode: null,
      locCode: "L",
      type: "absensi"
    },
    {
      no: 6,
      name: "Absensi ARA",
      code: "ARA",
      suffix: "ARA",
      ipLocal: "192.168.1.230",
      ipPublic: "103.144.208.154",
      port: 4800,
      scannerCode: 800,
      locCode: "F",
      type: "absensi"
    },
    {
      no: 7,
      name: "Absensi AB1",
      code: "AB1",
      suffix: "AB1",
      ipLocal: "192.168.1.231",
      ipPublic: "103.144.208.154",
      port: 4900,
      scannerCode: 900,
      locCode: "G",
      type: "absensi"
    },
    {
      no: 8,
      name: "Absensi AB2",
      code: "AB2",
      suffix: "AB2",
      ipLocal: "192.168.1.232",
      ipPublic: "103.144.208.154",
      port: 4400,
      scannerCode: 400,
      locCode: "H",
      type: "absensi"
    },
    {
      no: 9,
      name: "Absensi ARC_01",
      code: "ARC_01",
      suffix: "ARC",
      ipLocal: "192.168.1.235",
      ipPublic: "103.144.208.154",
      port: 4200,
      scannerCode: 200,
      locCode: "J",
      type: "absensi"
    },
    {
      no: 10,
      name: "Absensi ARC_02",
      code: "ARC_02",
      suffix: "ARC",
      ipLocal: "192.168.1.236",
      ipPublic: "103.144.208.154",
      port: 4201,
      scannerCode: 200,
      locCode: "J",
      type: "absensi"
    },
    {
      no: 11,
      name: "Absensi_DME_02",
      code: "DME_02",
      suffix: "DME",
      ipLocal: "192.168.1.11",
      ipPublic: "103.144.228.42",
      port: 4701,
      scannerCode: 700,
      locCode: "E",
      type: "absensi"
    },
    {
      no: 12,
      name: "Absensi P1A",
      code: "P1A",
      suffix: "P1A",
      ipLocal: "10.0.0.90",
      ipPublic: "223.25.98.220",
      port: 4100,
      scannerCode: 100,
      locCode: "A",
      type: "absensi"
    },
    {
      no: 13,
      name: "Absensi P1B",
      code: "P1B",
      suffix: "P1B",
      ipLocal: "10.0.0.91",
      ipPublic: "223.25.98.220",
      port: 4300,
      scannerCode: 300,
      locCode: "B",
      type: "absensi"
    },
    {
      no: 14,
      name: "Absensi P2A",
      code: "P2A",
      suffix: "P2A",
      ipLocal: "10.0.0.92",
      ipPublic: "223.25.98.220",
      port: 4500,
      scannerCode: 500,
      locCode: "C",
      type: "absensi"
    },
    {
      no: 15,
      name: "Absensi P2B",
      code: "P2B",
      suffix: "P2B",
      ipLocal: "10.0.0.93",
      ipPublic: "223.25.98.220",
      port: 4600,
      scannerCode: 600,
      locCode: "D",
      type: "absensi"
    }
  ]
}