/**
 * Generadores del texto de los documentos de la carga inicial.
 *
 * Cada documento de datos.js llama a una de estas plantillas con sus propios
 * datos, de modo que los 50 archivos tienen contenido distinto y verosimil
 * (contratos, actas, facturas, politicas...) en vez de "lorem ipsum".
 *
 * El texto lleva tildes y enes a proposito: en UTF-8 ocupan 2 bytes, asi que
 * el numero de bytes no coincide con el de caracteres. Sirve para comprobar
 * que `tamano` guarda bytes reales (lo que mide GridFS) y no caracteres.
 *
 * La organizacion y todas las personas y empresas son ficticias.
 */

export const EMPRESA = 'Nexo Consultores, S.A.';
const NIT_EMPRESA = '9876543-2';
const CIUDAD = 'Ciudad de Guatemala';
const TASA_IVA = 0.12;

const formatoMoneda = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const quetzales = (monto) => `Q ${formatoMoneda.format(monto)}`;

const lista = (elementos, marca = '-') => elementos.map((e) => `${marca} ${e}`).join('\n');
const numerada = (elementos) => elementos.map((e, i) => `${i + 1}. ${e}`).join('\n');

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

const ORDINALES = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA'];

export function contrato({ titulo, codigo, cliente, nitCliente, representante, objeto, entregables, monto, formaPago, plazo, fecha, clausulasExtra = [] }) {
  const clausulas = [
    ['OBJETO', objeto],
    ['ENTREGABLES', `El CONSULTOR entregará lo siguiente:\n\n${lista(entregables)}`],
    ['HONORARIOS', `El CLIENTE pagará la suma total de ${quetzales(monto)} más IVA, ${formaPago}.`],
    ['PLAZO', `El presente contrato tendrá una vigencia de ${plazo}, contados a partir de la fecha de firma.`],
    ['CONFIDENCIALIDAD', 'Ambas partes se obligan a guardar reserva sobre la información que reciban con motivo de este contrato, durante su vigencia y dos (2) años después de su terminación.'],
    ...clausulasExtra,
    ['TERMINACIÓN ANTICIPADA', 'Cualquiera de las partes podrá dar por terminado el contrato con aviso escrito de treinta (30) días calendario. Los servicios prestados hasta esa fecha se pagarán en proporción a su avance.'],
    ['JURISDICCIÓN', `Para cualquier controversia, las partes se someten a los tribunales de ${CIUDAD}.`],
  ];

  return `# ${titulo}

**Código:** ${codigo}
**Fecha:** ${fecha}
**Lugar:** ${CIUDAD}

## Partes

- **EL CONSULTOR:** ${EMPRESA}, NIT ${NIT_EMPRESA}.
- **EL CLIENTE:** ${cliente}, NIT ${nitCliente}, representada por ${representante}.

## Cláusulas

${clausulas.map(([nombre, texto], i) => `### ${ORDINALES[i]}. ${nombre}\n\n${texto}`).join('\n\n')}

## Firmas

| Por EL CONSULTOR | Por EL CLIENTE |
|---|---|
| María Fernanda García Ruiz | ${representante} |
| Asesoría Legal | Representante legal |
`;
}

export function contratoTexto({ titulo, codigo, proveedor, nitProveedor, objeto, condiciones, monto, periodicidad, plazo, fecha }) {
  return `${titulo.toUpperCase()}
Código: ${codigo}
${CIUDAD}, ${fecha}

CONTRATANTE: ${EMPRESA}, NIT ${NIT_EMPRESA}
PROVEEDOR:   ${proveedor}, NIT ${nitProveedor}

1. OBJETO
${objeto}

2. CONDICIONES DEL SERVICIO
${numerada(condiciones)}

3. PRECIO Y FORMA DE PAGO
${quetzales(monto)} ${periodicidad}, IVA incluido, contra factura electrónica
(FEL) presentada dentro de los primeros cinco días hábiles de cada período.

4. VIGENCIA
${plazo}. Se renovará automáticamente por períodos iguales salvo aviso
escrito de cualquiera de las partes con treinta días de anticipación.

5. INCUMPLIMIENTO
El incumplimiento de los niveles de servicio durante dos períodos
consecutivos facultará al CONTRATANTE a dar por terminado el contrato sin
responsabilidad de su parte.

Firmas:

_____________________________          _____________________________
Por ${EMPRESA}               Por ${proveedor}
`;
}

// ---------------------------------------------------------------------------
// Actas y minutas
// ---------------------------------------------------------------------------

export function acta({ titulo, numero, fecha, hora, lugar, asistentes, agenda, desarrollo, acuerdos, proximaReunion }) {
  return `# ${titulo}

**Acta n.º** ${numero}
**Fecha:** ${fecha}, ${hora}
**Lugar:** ${lugar}

## Asistentes

${lista(asistentes)}

## Agenda

${numerada(agenda)}

## Desarrollo

${desarrollo.map(([punto, texto]) => `### ${punto}\n\n${texto}`).join('\n\n')}

## Acuerdos

| N.º | Acuerdo | Responsable | Fecha límite |
|---|---|---|---|
${acuerdos.map(([acuerdo, responsable, limite], i) => `| ${i + 1} | ${acuerdo} | ${responsable} | ${limite} |`).join('\n')}

**Próxima reunión:** ${proximaReunion}
`;
}

export function minuta({ titulo, fecha, participantes, avances, pendientes, riesgos, siguientePaso }) {
  return `${titulo.toUpperCase()}
Fecha: ${fecha}
Participantes: ${participantes.join(', ')}

AVANCES DESDE LA ÚLTIMA REUNIÓN
${lista(avances)}

PENDIENTES
${lista(pendientes)}

RIESGOS O BLOQUEOS
${riesgos.length ? lista(riesgos) : '- Ninguno reportado.'}

SIGUIENTE PASO
${siguientePaso}
`;
}

// ---------------------------------------------------------------------------
// Facturacion
// ---------------------------------------------------------------------------

export function factura({ tipo = 'FACTURA', serie, numero, fecha, cliente, nitCliente, direccion, lineas, referencia, observaciones }) {
  const filas = lineas.map(([descripcion, cantidad, precio]) => ({
    descripcion,
    cantidad,
    precio,
    total: cantidad * precio,
  }));
  const total = filas.reduce((suma, f) => suma + f.total, 0);
  // Los precios incluyen IVA (asi se emite en Guatemala): se desglosa la base.
  const base = total / (1 + TASA_IVA);
  const iva = total - base;
  const ancho = 44;

  return `${EMPRESA}
NIT ${NIT_EMPRESA}
6a. Avenida 12-45, Zona 10, ${CIUDAD}

${tipo} ELECTRÓNICA (FEL)
Serie: ${serie}   Número: ${numero}
Fecha de emisión: ${fecha}
${referencia ? `Documento que modifica: ${referencia}\n` : ''}
Cliente:   ${cliente}
NIT:       ${nitCliente}
Dirección: ${direccion}

${'Descripción'.padEnd(ancho)} ${'Cant.'.padStart(5)} ${'P. unitario'.padStart(14)} ${'Total'.padStart(14)}
${'-'.repeat(ancho + 36)}
${filas
  .map((f) => `${f.descripcion.padEnd(ancho)} ${String(f.cantidad).padStart(5)} ${quetzales(f.precio).padStart(14)} ${quetzales(f.total).padStart(14)}`)
  .join('\n')}
${'-'.repeat(ancho + 36)}
${'Base imponible'.padStart(ancho + 21)} ${quetzales(base).padStart(14)}
${'IVA (12 %)'.padStart(ancho + 21)} ${quetzales(iva).padStart(14)}
${'TOTAL'.padStart(ancho + 21)} ${quetzales(total).padStart(14)}

${observaciones}
Sujeto a pagos trimestrales ISR.
`;
}

// ---------------------------------------------------------------------------
// Politicas y procedimientos
// ---------------------------------------------------------------------------

export function politica({ titulo, codigo, version, vigencia, aprobadoPor, objetivo, alcance, secciones, responsables }) {
  return `# ${titulo}

| Código | Versión | Vigente desde | Aprobado por |
|---|---|---|---|
| ${codigo} | ${version} | ${vigencia} | ${aprobadoPor} |

## 1. Objetivo

${objetivo}

## 2. Alcance

${alcance}

${secciones.map(([nombre, contenido], i) => `## ${i + 3}. ${nombre}\n\n${Array.isArray(contenido) ? lista(contenido) : contenido}`).join('\n\n')}

## ${secciones.length + 3}. Responsables

${lista(responsables)}

---
*Documento de uso interno de ${EMPRESA}. Cualquier excepción debe aprobarla por escrito la Gerencia General.*
`;
}

export function procedimientoTexto({ titulo, codigo, objetivo, pasos, notas }) {
  return `${titulo.toUpperCase()}
Código: ${codigo}

OBJETIVO
${objetivo}

PASOS
${pasos.map(([quien, que], i) => `${String(i + 1).padStart(2)}. [${quien}] ${que}`).join('\n')}

NOTAS
${lista(notas)}
`;
}

// ---------------------------------------------------------------------------
// Presupuestos e informes
// ---------------------------------------------------------------------------

export function presupuestoTexto({ titulo, area, periodo, responsable, partidas, comentario }) {
  const total = partidas.reduce((suma, [, monto]) => suma + monto, 0);
  const ancho = 46;
  return `${titulo.toUpperCase()}
Área: ${area}
Período: ${periodo}
Responsable: ${responsable}

${'Partida'.padEnd(ancho)} ${'Monto'.padStart(16)} ${'%'.padStart(7)}
${'-'.repeat(ancho + 25)}
${partidas
  .map(([partida, monto]) => `${partida.padEnd(ancho)} ${quetzales(monto).padStart(16)} ${((monto / total) * 100).toFixed(1).padStart(6)}%`)
  .join('\n')}
${'-'.repeat(ancho + 25)}
${'TOTAL'.padEnd(ancho)} ${quetzales(total).padStart(16)} ${'100.0'.padStart(6)}%

${comentario}
`;
}

export function tablaMarkdown(encabezados, filas) {
  return [
    `| ${encabezados.join(' | ')} |`,
    `|${encabezados.map(() => '---').join('|')}|`,
    ...filas.map((fila) => `| ${fila.join(' | ')} |`),
  ].join('\n');
}

export function informe({ titulo, subtitulo, fecha, autor, resumen, secciones, conclusiones }) {
  return `# ${titulo}

${subtitulo ? `*${subtitulo}*\n\n` : ''}**Fecha:** ${fecha}
**Elaborado por:** ${autor}

## Resumen ejecutivo

${resumen}

${secciones.map(([nombre, contenido]) => `## ${nombre}\n\n${contenido}`).join('\n\n')}

## Conclusiones y recomendaciones

${numerada(conclusiones)}
`;
}

// ---------------------------------------------------------------------------
// Notas sueltas
// ---------------------------------------------------------------------------

export function notas({ titulo, fecha, bloques }) {
  return `${titulo}
${fecha ? `Actualizado: ${fecha}\n` : ''}
${bloques.map(([encabezado, items]) => `${encabezado}\n${items.map((i) => `[ ] ${i}`).join('\n')}`).join('\n\n')}
`;
}
