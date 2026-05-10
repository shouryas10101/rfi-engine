// Test findCatalogueValue for specific parameters

const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function findCatalogueValue(params: Record<string, unknown>, key: string, label: string): unknown {
  const nKey = norm(key);
  const nLabel = norm(label);

  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk === nKey || nk === nLabel) { console.log(`  [Tier1 exact] ${k}`); return v; }
  }
  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk.includes(nKey) || nKey.includes(nk)) { console.log(`  [Tier2 sub key] ${k}`); return v; }
    if (nk.includes(nLabel) || nLabel.includes(nk)) { console.log(`  [Tier2 sub label] ${k}`); return v; }
  }
  const tokens = [...new Set([...(nKey.match(/[a-z0-9]{3,}/g) ?? []), ...(nLabel.match(/[a-z0-9]{3,}/g) ?? [])])];
  for (const [k, v] of Object.entries(params)) {
    const kToks = norm(k).match(/[a-z0-9]{3,}/g) ?? [];
    if (tokens.some((t) => kToks.some((kt) => kt.includes(t) || t.includes(kt)))) { console.log(`  [Tier3 token] ${k}`); return v; }
  }
  return undefined;
}

const NOVA_PARAMS: Record<string, unknown> = {
  "b10_life": "7 years",
  "parameter": "Nova",
  "weight_kg": 310,
  "altitude_m": "4500 m",
  "gear_ratio": "11.5 : 1",
  "can_bus_speed": "1 Mbps / configurable",
  "control_loops": "Speed, Torque & Position",
  "cooling_medium": "Water-Glycol (50-50)",
  "control_voltage": "12 V / 24 V selectable",
  "motor_technology": "PMSM",
  "protection_rating": "IP67",
  "driveline_architecture": "Integrated eAxle",
  "nominal_rated_voltage_v": 800,
  "operating_voltage_range_v": "400-900",
};

const tests = [
  { key: "nominal_rated_voltage", label: "Nominal/Rated Voltage" },
  { key: "driveline_architecture", label: "Driveline Architecture" },
  { key: "cooling", label: "Cooling" },
  { key: "motor_technology", label: "Motor Technology" },
  { key: "operating_voltage_range", label: "Operating Voltage Range" },
];

for (const t of tests) {
  console.log(`\nLooking for key="${t.key}" label="${t.label}":`);
  console.log(`  norm(key)="${norm(t.key)}" norm(label)="${norm(t.label)}"`);
  const val = findCatalogueValue(NOVA_PARAMS, t.key, t.label);
  console.log(`  → value: ${JSON.stringify(val)}`);
}
