const { normalizar } = require('./text');

// Solo atributos explicitos del nombre. Una referencia para ambas especies
// no permite reemplazar su clasificacion por una sola de ellas.
function especiePorNombre(nombre = '') {
  const texto = normalizar(nombre);
  const gato = /\b(?:feline|felin[oa]s?|gatos?|cats?)\b/.test(texto);
  const perro = /\b(?:canine|canin[oa]s?|perros?|dogs?)\b/.test(texto);
  return gato === perro ? null : gato ? 'gato' : 'perro';
}

function pesoCorregido(nombre, peso) {
  // Correccion confirmada por el responsable del catalogo, no una conversion
  // general de gramos a kilos (medicamentos y sobres pueden usar gramos).
  return normalizar(nombre) === 'pro plan feline en' && /^1[.,]5\s*g$/i.test(peso)
    ? '1.5kg' : peso;
}
module.exports = { especiePorNombre, pesoCorregido };
