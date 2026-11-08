/**
 * Drop a glTF (`.glb`) in `public/models/staff/` then point that staff id here.
 * Until a path is set, the office keeps the built-in person.
 * Lighting and room layout stay unchanged.
 */
export const STAFF_GLB: Partial<Record<string, string>> = {
  // staff_morgan: '/models/staff/staff_morgan.glb',
  // staff_priya: '/models/staff/staff_priya.glb',
  // staff_jonah: '/models/staff/staff_jonah.glb',
  // staff_lena: '/models/staff/staff_lena.glb',
  // staff_samir: '/models/staff/staff_samir.glb',
  // staff_nina: '/models/staff/staff_nina.glb',
  // staff_maya: '/models/staff/staff_maya.glb',
  // staff_casey: '/models/staff/staff_casey.glb',
  // staff_helen: '/models/staff/staff_helen.glb',
  // staff_marco: '/models/staff/staff_marco.glb',
  // staff_aisha: '/models/staff/staff_aisha.glb',
  // staff_david: '/models/staff/staff_david.glb',
  // staff_ruth: '/models/staff/staff_ruth.glb',
  // staff_elise: '/models/staff/staff_elise.glb',
  // staff_tom: '/models/staff/staff_tom.glb',
  // staff_sofia: '/models/staff/staff_sofia.glb',
  // staff_imani: '/models/staff/staff_imani.glb',
  // staff_jules: '/models/staff/staff_jules.glb',
}

export function staffModelUrl(staffId: string): string | undefined {
  return STAFF_GLB[staffId]
}
