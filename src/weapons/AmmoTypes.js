// Ammo "type" categories — different weapons share an ammo pool by type so
// pickups feel meaningful (a shotgun and a sawed-off both restock SHELL).

export const AMMO = {
  LIGHT:     { id: 'LIGHT',     label: '9mm',    color: '#ffe066' },
  HEAVY:     { id: 'HEAVY',     label: '7.62',   color: '#ffaa33' },
  SHELL:     { id: 'SHELL',     label: 'shells', color: '#ff7755' },
  ROCKET:    { id: 'ROCKET',    label: 'rocket', color: '#ff5544' },
  FUEL:      { id: 'FUEL',      label: 'fuel',   color: '#ffcc44' },
  EXPLOSIVE: { id: 'EXPLOSIVE', label: 'demo',   color: '#ff7733' },
  MELEE:     { id: 'MELEE',     label: '∞',      color: '#cccccc' },
};
