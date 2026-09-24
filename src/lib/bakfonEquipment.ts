export type BakfonEquipmentItem = {
  sequence: number;
  name: string;
  qty: number;
  unit: string;
};

const EQUIPMENT_TSV = `1\tAccess card\t2900\tədəd
2\tAccess Reader (card/PIN)\t361\tədəd
3\tFace Recognition Access Control Terminal\t12\tədəd
4\tFace Recognition Access Controller Bracket (for Turniket)\t8\tədəd
5\tAGM Battery 12V 7AH\t111\tədəd
6\tDoor Closer\t355\tədəd
7\tDoor Contact\t355\tədəd
8\tMexaniki çıxış düyməsi Exit & Emergency Buton\t373\tədəd
9\tPro Series Access Controller\t111\tədəd
10\tSingle Door Magnetic Lock > 280KG\t355\tədəd
11\tSingle Door Magnetic Lock Bracket\t57\tədəd
12\tTurniket Left Flap Barrier\t2\tədəd
13\tTurniket Midlle Flap Barrier\t2\tədəd
14\tTurniket Right Flap Barrier\t2\tədəd
15\t48-slot High-performance Cluster Storage\t5\tədəd
16\t4 MP 25X Powered Ultra Series compatible with Radars Network Speed Dome; Smart Tracking; Defog Mode\t45\tədəd
17\t4 MP Motorized Varifocal 2.8 ~ 12 mm Bullet Network Camera for Perimeter Protection\t465\tədəd
18\t4 MP 2.8 mm Fixed Focal Length DOME Network Camera; AcuPick\t399\tədəd
19\t4 MP Motorized Varifocal 2.8 ~ 12 mm DOME Network Camera; Face Detection; Face Recognition; People Count\t8\tədəd
20\tElektrik açarı 16A\t55\tədəd
21\tElektrik açarı 64A\t4\tədəd
22\tHDD 16TB for Cluster Server\t240\tədəd
23\tDahua Server\t1\tədəd
24\tInjector for PTZ camera\t17\tədəd
25\tIP66 Qutu Soyutma Ventilyatorlu\t4\tədəd
26\tJunction box for Bullet Camera\t465\tədəd
27\tMonitor 27”\t42\tədəd
28\tMouse and Keyboard\t30\tset
29\tParapet Wall Mount Bracket (For instalation 2x Bullet Camera)\t154\tədəd
30\tParapet Wall Mount Bracket (For PTZ instalation)\t25\tset
31\tParapet Wall Mount Bracket (For Radar installation)\t24\tədəd
32\tPC; CPU: Intel Core i7/i9; RAM: 32GB; GPU: NVIDIA Quadro; NIC: Gigabit Ethernet; Windows 11 Pro 64-bit\t30\tədəd
33\tPTZ Corner mount Bracket\t19\tədəd
34\tPTZ joystick(Android)\t7\tədəd
35\tUPS 10KV OnLine; Rack Mount\t4\tədəd
36\tUPS 2KV OnLine; Rack Mount\t21\tədəd
37\tUPS 3KV OnLine; Rack Mount\t55\tədəd
38\tPole mount Bracket for Bullet Camera\t178\tədəd
39\tPTZ Bracket\t28\tədəd
40\t120m Security Radar\t16\tədəd
41\t240m Security Radar\t8\tədəd
42\t36 VDC Power adaptor For Radar\t24\tədəd
43\tPole mount Bracket for Radar\t24\tədəd
44\tRadar Bracket\t24\tədəd
45\tThermal Hybrid Speed Dome Camera 4MP; Focal Length 3.95 mm–177.75 mm; Thermal Focal Length 13mm; Smart Tracking\t8\tədəd
46\tInjector for Thermal Speed Dome camera\t8\tədəd
47\tAccess Control-Chanel-License\t419\tədəd
48\tRADAR-License\t24\tədəd
49\tUVSS-License\t4\tədəd
50\tVideo-Chanel-License\t967\tədəd
51\tDHI-DSSPro8-Video-Base-License\t1\tədəd
52\tDHI-DSSPro8-Door-Base-License\t1\tədəd
53\tDHI-DSSPro8-SSM-Device-License\t4\tədəd
54\tDHI-DSSPro8-WMD-Device-License\t4\tədəd
55\tRack Cabine 22U Indoor 800x800\t65\tədəd
56\tRack Cabine 42U Indoor 1000x800\t4\tədəd
57\tRack Cabine 9U Outdoor\t21\tədəd
58\tRJ45 + Rezin CAT6\t1200\tədəd
59\tRJ45 Patch Cord 1 metrik\t1007\tədəd
60\tRJ45 Patch panel 24 portlu\t77\tədəd
61\tSmart PoE+ Manage Switch 24-Port\t22\tədəd
62\tIndustrial PoE Switch 4-Port(1 Port PoE++; 2 Ports SFP)\t4\tədəd
63\tLYTE DIN Rail Power Supply DRL-48V120W1AA\t1\tədəd
64\tRJ45 Patch Cord 3 metrik\t50\tədəd
65\tSC/UPC 4x Ports Fiber Optik Kaset\t4\tədəd
66\tSFP Single Mode 1KM (A+B)\t4\tədəd
67\tSFP Single mode 10km\t352\tədəd
68\tCore Switch 96x10G Ports\t2\tədəd
69\tPatch Cord SM LC/UPC-SC/UPC, 10 metrik; Duplex\t100\tədəd
70\tPDU - Vertical Rackmount 42U\t8\tədəd
71\tPDU euro plug 6 gözlü\t77\tədəd
72\tVertical Cable Management Panel, 42U, 2-Pack\t4\tədəd
73\tIndustrial PoE Switch 16-Port(1 Port PoE++; 2 Ports SFP)\t21\tədəd
74\tSmart PoE+ Manage Switch 16-Port (16 Port Ethernet; 2 Ports SFP)\t38\tədəd
75\tSmart PoE+ Manage Switch 16-Port (16 Port Ethernet; 4 Ports SFP)\t1\tədəd
76\tPatch Cord SM LC/UPC-SC/UPC, 1 metrik; Duplex\t23\tədəd
77\tPatch Cord SM LC/UPC-SC/UPC, 3 metrik; Duplex\t241\tədəd
78\tCable management 1U\t170\tədəd
79\tPatch Panel FO 48 SC/UPC-SC/UPC (Full komplekt)\t14\tədəd
80\tPatch Panel FO 8 SC/UPC-SC/UPC (Full komplekt)\t78\tədəd
81\tBollard (antitaran), Complete set (3 pcs)\t3\tədəd
82\tBollard (antitaran), Complete set (5 pcs)\t1\tədəd
83\tHandheld Metal Detector\t8\tədəd
84\tIntelligent Security Screening Machine\t4\tədəd
85\tUVSS System(Complete Set)\t4\tədəd
86\tWalk-through Metal Detector\t4\tədəd
87\tKompakt dinamik səs gücləndiricisi\t4\tədəd
88\tUzaqdan Çağırış Mikrofonu\t4\tədəd
89\tXarici rupor dinamiki\t8\tədəd
90\tWindow Intercom System\t8\tədəd
91\tDisplay Unit\t12\tədəd
92\tStructural module, 55” bracket of rear maintenance\t4\tədəd
93\tPedestal of Display Unit with a height of 1 meter\t6\tədəd
94\tCables, HDMI 10m male-male/4K with buckle\t6\tədəd
95\tAccessories, Project accessory kit (Dahua)\t2\tədəd
96\tAccessories, Tie rod\t6\tədəd
97\tPallet for Pedestal\t1\tədəd
98\tIR Accessories (Optional)\t1\tədəd
99\tDecoder,4 Channel Ultra HD Network Video Decoder\t1\tədəd
100\tStructural module, 55” bracket of rear maintenance\t8\tədəd
101\tCables, HDMI 10m male-male/4K with buckle\t10\tədəd
102\tPallet for Pedestal\t2\tədəd
103\tIR Accessories (Optional)\t1\tədəd
104\tDecoder,9 Channel Ultra HD Network Video Decoder\t1\tset
105\tGas fire extinguishing for a volume of 15 cubic meters,m³ - Maxlogic/Rotarex\t5\tset
106\tGas fire extinguishing for a volume of 20 cubic meters,m³ - Maxlogic/Rotarex\t18\tset
107\tGas fire extinguishing for a volume of 30 cubic meters,m³ - Maxlogic/Rotarex\t2\tset
108\tGas fire extinguishing for a volume of 45 cubic meters,m³ - Maxlogic/Rotarex\t23\tset
109\tGas fire extinguishing for a volume of 75 cubic meters,m³ - Maxlogic/Rotarex\t3\tədəd
110\tQuraşdırılma Xidməti\t1\tədəd`;

export const BAKFON_EQUIPMENT: BakfonEquipmentItem[] = EQUIPMENT_TSV.split("\n").map((line) => {
  const [sequence, name, qty, unit] = line.split("\t");
  return { sequence: Number(sequence), name, qty: Number(qty), unit };
});
