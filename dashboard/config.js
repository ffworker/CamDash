window.CAMDASH_CONFIG = {
  go2rtcBase: "http://172.17.1.56:1984",
  defaultSeconds: 60,

  pages: [
    {
      name: "Einfahrt",
      cams: [
        { id: "einfahrt_1", label: "Einfahrt 1" },
        { id: "einfahrt_2", label: "Einfahrt 2" },
        { id: "ks_rampe_1", label: "KS Rampe 1" },
        { id: "ks_rampe_2", label: "KS Rampe 2" },
      ],
    },
    {
      name: "Fahrweg 1",
      cams: [
        { id: "fahrweg_1_1", label: "Fahrweg 1_1" },
        { id: "fahrweg_1_2", label: "Fahrweg 1_2" },
        null,
        null,
      ],
    },
    {
      name: "Rübgrund",
      cams: [
        { id: "ruebgrund_turm", label: "Ruebgrund Turm" },
        { id: "ruebgrund_schranke", label: "Ruebgrund Schranke" },
        { id: "ruebgrund_container", label: "Ruebgrund Container" },
        { id: "ruebgrund_zelt", label: "Ruebgrund Zelt" },
      ],
    },
    {
      name: "Fahrweg 2",
      cams: [
        { id: "fahrweg_2_1", label: "Fahrweg 2_1" },
        { id: "fahrweg_2_2", label: "Fahrweg 2_2" },
        { id: "fahrweg_2_3", label: "Fahrweg 2_3" },
        { id: "fahrweg_2_4", label: "Fahrweg 2_4" },
      ],
    },
    {
      name: "Ausfahrt & Sonstiges",
      cams: [
        { id: "mittelgang", label: "Mittelgang" },
        { id: "containerlager", label: "Containerlager" },
        { id: "ausfahrt", label: "Ausfahrt" },
        { id: "ausfahrt_schranke", label: "Ausfahrt Schranke" },
      ],
    },
    {
      name: "Fahrweg 3",
      cams: [
        { id: "fahrweg_3_1", label: "Fahrweg 3_1" },
        { id: "fahrweg_3_2", label: "Fahrweg 3_2" },
        { id: "fahrweg_3_3", label: "Fahrweg 3_3" },
        { id: "fahrweg_3_4", label: "Fahrweg 3_4" },
      ],
    },
  ],
};
