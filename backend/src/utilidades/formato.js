/** Tamano legible para mensajes e historial: 2150 -> "2.1 KB". */
export function formatearBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(1)} ${unidades[i]}`;
}

/** "Contrato.Final.MD" -> "md"; "" si no tiene extension. */
export function extensionDe(nombre) {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '';
}
