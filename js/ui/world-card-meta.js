const PROFILES = Object.freeze({
  limiar: {
    name: "O Limiar", sigil: "◉", palette: ["#e7bb3f", "#07191b"],
    effect: "O território atravessa o ritual e marca suas cartas.",
  },
  entrelinhas: {
    name: "Entrelinhas", sigil: "△", palette: ["#72d5d3", "#061a21"],
    effect: "O que não foi dito encontra uma forma de aparecer.",
  },
  camara: {
    name: "A Câmara", sigil: "□", palette: ["#bd91ef", "#140b20"],
    effect: "Toda escolha deixa uma inscrição na Câmara.",
  },
  sexto_lugar: {
    name: "O Sexto Lugar", sigil: "◇", palette: ["#f0e4bd", "#25160b"],
    effect: "O mundo inteiro converge para esta carta.",
  },
});

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isFragmentCard(card) {
  return !!card?.fragmentId || fold(card?.type).includes("fragment");
}

export function resolveWorldCardMeta(card) {
  const fragment = isFragmentCard(card);
  const raw = fragment ? card : card?.worldInfluence;
  if (!raw) return null;

  const territoryId = fold(raw.territoryId || "limiar").replace(/\s+/g, "_");
  const profile = PROFILES[territoryId] || PROFILES.limiar;
  const suppliedPalette = Array.isArray(raw.palette) ? raw.palette : [];
  const palette = [
    /^#[0-9a-f]{6}$/i.test(suppliedPalette[0] || "") ? suppliedPalette[0] : profile.palette[0],
    /^#[0-9a-f]{6}$/i.test(suppliedPalette[1] || "") ? suppliedPalette[1] : profile.palette[1],
  ];

  return {
    kind: fragment ? "fragment" : "influence",
    territoryId,
    name: fragment ? `Fragmento · ${profile.name}` : (raw.name || profile.name),
    sigil: raw.sigil || profile.sigil,
    palette,
    effect: raw.effect || profile.effect,
    rarity: fold(card?.rarity || "comum"),
    fragmentId: card?.fragmentId || null,
    resonance: fragment ? "fragment" : (card?.worldResonance === "signature" ? "signature" : "ambient"),
  };
}

