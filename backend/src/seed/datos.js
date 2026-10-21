/**
 * Datos de la carga inicial.
 *
 * No son documentos listos para insertar: son la DESCRIPCION de lo que existe
 * (usuarios, carpetas, archivos) y una LINEA DE TIEMPO de operaciones. seed.js
 * reproduce esa linea de tiempo en orden, y cada operacion modifica los datos
 * y deja su entrada de historial con la fecha simulada. Asi la base termina
 * siendo el resultado de operaciones que de verdad "ocurrieron", y no un
 * monton de datos sueltos que podrian contradecirse.
 *
 * Personas, empresas y dominios de correo son ficticios.
 */
import {
  contrato, contratoTexto, acta, minuta, factura, politica, procedimientoTexto,
  presupuestoTexto, informe, notas, tablaMarkdown, quetzales, EMPRESA,
} from './contenidos.js';

export const CONTRASENA_PRUEBA = 'Documental2026!';

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export const USUARIOS = [
  { username: 'admin', email: 'admin@nexo-consultores.example', nombreCompleto: 'Andrés Salazar Medina', rol: 'ADMINISTRADOR' },
  { username: 'mgarcia', email: 'mgarcia@nexo-consultores.example', nombreCompleto: 'María Fernanda García Ruiz', rol: 'USUARIO' },
  { username: 'jlopez', email: 'jlopez@nexo-consultores.example', nombreCompleto: 'Jorge Luis López Torres', rol: 'USUARIO' },
  { username: 'cperez', email: 'cperez@nexo-consultores.example', nombreCompleto: 'Carmen Pérez Vargas', rol: 'USUARIO' },
];

// ---------------------------------------------------------------------------
// Carpetas: clave = ruta final -> propietario
// ---------------------------------------------------------------------------
// La clave es la ruta donde la carpeta queda al final de la simulacion. Si una
// carpeta se crea en otro lugar y luego se mueve, la operacion de creacion
// indica su padre inicial (ver LINEA_DE_TIEMPO).

export const CARPETAS = {
  // admin
  '/Administración': 'admin',
  '/Administración/Manuales': 'admin',
  // mgarcia — Asesoría Legal (3 niveles: Contratos > Clientes > 2026)
  '/Contratos': 'mgarcia',
  '/Contratos/Clientes': 'mgarcia',
  '/Contratos/Clientes/2026': 'mgarcia',
  '/Contratos/Proveedores': 'mgarcia',
  '/Actas': 'mgarcia',
  '/Borradores': 'mgarcia',
  '/Borradores/Antiguos': 'mgarcia',
  // jlopez — Finanzas
  '/Finanzas': 'jlopez',
  '/Finanzas/Presupuestos': 'jlopez',
  '/Finanzas/Presupuestos/Q3': 'jlopez',
  '/Finanzas/Facturas': 'jlopez',
  // cperez — Recursos Humanos y Proyectos
  '/Recursos Humanos': 'cperez',
  '/Recursos Humanos/Políticas': 'cperez',
  '/Proyectos': 'cperez',
  '/Proyectos/Implementación ERP': 'cperez',
  '/Proyectos/Implementación ERP/Entregables': 'cperez',
};

// ---------------------------------------------------------------------------
// Archivos: clave = nombre final
// ---------------------------------------------------------------------------
// `carpeta` es la ubicacion final (null = raiz). `contenido` es una funcion
// para que el texto se genere al subirlo y la verificacion pueda volver a
// generarlo y compararlo byte a byte con lo que hay en GridFS.

const A = (nombre, propietario, carpeta, etiquetas, contenido) => ({ nombre, propietario, carpeta, etiquetas, contenido });

export const ARCHIVOS = [
  // ======================= admin =======================
  A('manual-uso-sistema-documental.md', 'admin', '/Administración/Manuales', ['manual', 'sistema', 'capacitacion'], () => `# Manual de uso del sistema documental

Guía rápida para el personal de ${EMPRESA}.

## 1. Ingreso

Cada colaborador ingresa con su usuario y contraseña. La contraseña inicial debe cambiarse en el primer ingreso y no debe compartirse con nadie, ni siquiera con el área de Administración.

## 2. Organización de carpetas

- Cada área trabaja en su propia carpeta raíz (Contratos, Finanzas, Recursos Humanos, Proyectos).
- No cree más de cuatro niveles de subcarpetas: la información se vuelve difícil de encontrar.
- Use los nombres de carpeta en singular o plural de forma consistente dentro de su área.

## 3. Subir archivos

Por ahora el sistema acepta archivos de texto (\`.txt\`) y Markdown (\`.md\`). Antes de subir un archivo revise que el nombre siga la guía de buenas prácticas de nombres.

## 4. Compartir

| Nivel | Qué permite |
|---|---|
| Lectura | Ver y descargar |
| Comentario | Lo anterior, más dejar observaciones |
| Edición | Lo anterior, más modificar, renombrar y mover |

Compartir una carpeta da acceso a **todo** su contenido, incluidas las subcarpetas.

## 5. Papelera

Lo que se elimina va a la papelera y puede restaurarse. Al eliminar una carpeta se envía a la papelera todo su contenido. La eliminación definitiva no se puede deshacer.

## 6. Soporte

Escriba a admin@nexo-consultores.example indicando el nombre del archivo y la hora aproximada del problema.
`),
  A('guia-buenas-practicas-nombres.md', 'admin', '/Administración/Manuales', ['guia', 'nomenclatura'], () => `# Guía de buenas prácticas para nombrar archivos

Un buen nombre permite encontrar un documento sin abrirlo.

## Reglas

1. Use minúsculas y guiones: \`contrato-servicios-clinica-santa-rosa.md\`.
2. No use espacios, tildes ni caracteres especiales en el nombre del archivo.
3. Incluya el año o la fecha cuando el documento sea periódico: \`acta-reunion-directorio-2026-03.md\`.
4. Para versiones use el sufijo \`-v1\`, \`-v2\`; nunca \`final\`, \`final2\` o \`ahora-si\`.
5. Las facturas se nombran con su serie y número: \`factura-F001-000231.txt\`.

## Ejemplos

${tablaMarkdown(['Incorrecto', 'Correcto'], [
  ['Contrato Final (2).txt', 'contrato-auditoria-inmobiliaria-norte-2026.md'],
  ['acta junio.md', 'acta-reunion-directorio-2026-06.md'],
  ['presupuesto nuevo nuevo.txt', 'presupuesto-q3-area-legal.txt'],
])}

## Etiquetas

Agregue entre dos y cuatro etiquetas por archivo (cliente, tipo de documento, año). Las etiquetas se incluyen en la búsqueda.
`),
  A('inventario-equipos-oficina.txt', 'admin', '/Administración', ['inventario', 'equipos'], () => `INVENTARIO DE EQUIPOS DE OFICINA — ${EMPRESA}
Corte: 30 de abril de 2026
Responsable: Andrés Salazar Medina

CÓDIGO     EQUIPO                         ASIGNADO A                 ESTADO
--------------------------------------------------------------------------------
EQ-001     Laptop Lenovo ThinkPad E14     María Fernanda García      Bueno
EQ-002     Laptop Lenovo ThinkPad E14     Jorge Luis López           Bueno
EQ-003     Laptop Dell Latitude 5440      Carmen Pérez Vargas        Bueno
EQ-004     Laptop Dell Latitude 5440      Andrés Salazar Medina      Bueno
EQ-005     Monitor 24" LG                 Sala de reuniones          Regular
EQ-006     Impresora multifuncional HP    Recepción                  Requiere toner
EQ-007     Proyector Epson                Sala de reuniones          Bueno
EQ-008     Router Mikrotik                Cuarto de servidores       Bueno
EQ-009     NAS Synology 4 bahías          Cuarto de servidores       Bueno
EQ-010     UPS APC 1500 VA                Cuarto de servidores       Batería por cambiar

OBSERVACIONES
- La batería de la UPS (EQ-010) tiene cuatro años; cotizar reemplazo antes de junio.
- La impresora de recepción se incluye en el contrato de mantenimiento con TecnoService.
`),
  A('procedimiento-respaldo-informacion.md', 'admin', '/Administración', ['procedimiento', 'respaldo', 'seguridad'], () => politica({
    titulo: 'Procedimiento de respaldo de la información',
    codigo: 'ADM-PR-004',
    version: '1.0',
    vigencia: '1 de junio de 2026',
    aprobadoPor: 'Gerencia General',
    objetivo: 'Garantizar que la información de la organización pueda recuperarse ante fallas de equipo, errores humanos o incidentes de seguridad.',
    alcance: 'Aplica a la base de datos del sistema documental, al NAS de la oficina y a los equipos portátiles del personal.',
    secciones: [
      ['Frecuencia', [
        'Base de datos del sistema documental: respaldo completo diario a las 22:00.',
        'NAS: copia incremental diaria y completa los domingos.',
        'Equipos portátiles: sincronización semanal de la carpeta de trabajo.',
      ]],
      ['Retención', 'Se conservan los respaldos diarios de los últimos 30 días y los semanales de los últimos 6 meses. Un respaldo mensual se guarda fuera de la oficina.'],
      ['Pruebas de restauración', 'El primer lunes de cada mes se restaura un respaldo elegido al azar en un equipo de prueba y se deja constancia del resultado.'],
    ],
    responsables: [
      'Administración de sistemas: ejecutar y vigilar los respaldos.',
      'Cada colaborador: guardar su trabajo en el sistema documental y no solo en su equipo.',
    ],
  })),
  A('directorio-telefonico-interno.txt', 'admin', null, ['directorio', 'contactos'], () => `DIRECTORIO TELEFÓNICO INTERNO
${EMPRESA} — actualizado en agosto de 2026

EXT.   NOMBRE                          ÁREA                      CORREO
-----------------------------------------------------------------------------------------------
100    Recepción                       Administración            recepcion@nexo-consultores.example
101    Andrés Salazar Medina           Administración            admin@nexo-consultores.example
110    María Fernanda García Ruiz      Asesoría Legal            mgarcia@nexo-consultores.example
120    Jorge Luis López Torres         Finanzas                  jlopez@nexo-consultores.example
130    Carmen Pérez Vargas             Recursos Humanos          cperez@nexo-consultores.example
140    Sala de reuniones               —                         —

Emergencias del edificio: ext. 900
Horario de atención: lunes a viernes de 8:00 a 17:00.
`),

  // ======================= mgarcia =======================
  A('plantilla-contrato-servicios.md', 'mgarcia', '/Contratos', ['plantilla', 'contrato'], () => contrato({
    titulo: 'Contrato de prestación de servicios profesionales (PLANTILLA)',
    codigo: 'LEG-CT-[AÑO]-[NÚMERO]',
    cliente: '[RAZÓN SOCIAL DEL CLIENTE]',
    nitCliente: '[NIT]',
    representante: '[NOMBRE DEL REPRESENTANTE LEGAL]',
    objeto: 'EL CONSULTOR prestará a EL CLIENTE los servicios de [DESCRIBIR EL SERVICIO] conforme a la propuesta técnica aceptada, que forma parte integral de este contrato.',
    entregables: ['[Entregable 1 y fecha]', '[Entregable 2 y fecha]', 'Informe final de cierre'],
    monto: 0,
    formaPago: 'en [NÚMERO] pagos contra entrega y aprobación de cada entregable',
    plazo: '[NÚMERO] meses',
    fecha: '[FECHA DE FIRMA]',
  }) + '\n> Antes de usar esta plantilla, confirme con Asesoría Legal si el cliente requiere cláusulas de penalización o garantías adicionales.\n'),
  A('contrato-servicios-transportes-delsur.md', 'mgarcia', '/Contratos/Clientes', ['contrato', 'cliente', 'transportes-del-sur'], () => contrato({
    titulo: 'Contrato de servicios de consultoría en procesos logísticos',
    codigo: 'LEG-CT-2026-003',
    cliente: 'Transportes Del Sur, S.A.',
    nitCliente: '4561237-8',
    representante: 'Ing. Roberto Castillo Aguilar',
    objeto: 'Diagnóstico y rediseño de los procesos de despacho y control de flota de EL CLIENTE en sus tres centros de distribución.',
    entregables: ['Diagnóstico de la situación actual (semana 4)', 'Propuesta de rediseño de procesos (semana 9)', 'Acompañamiento en la implementación (semanas 10 a 16)'],
    monto: 186000,
    formaPago: 'en tres pagos del 30 %, 40 % y 30 % contra aprobación de cada entregable',
    plazo: 'cuatro (4) meses',
    fecha: '9 de marzo de 2026',
  })),
  A('contrato-servicios-clinica-santa-rosa.md', 'mgarcia', '/Contratos/Clientes', ['contrato', 'cliente', 'salud'], () => contrato({
    titulo: 'Contrato de servicios de asesoría administrativa',
    codigo: 'LEG-CT-2026-005',
    cliente: 'Clínica Santa Rosa, S.A.',
    nitCliente: '7788123-4',
    representante: 'Dra. Patricia Monzón Leal',
    objeto: 'Asesoría para la estandarización de los procesos de admisión, facturación y archivo de expedientes clínicos.',
    entregables: ['Manual de procesos de admisión', 'Matriz de controles de facturación', 'Política de archivo y conservación de expedientes'],
    monto: 94500,
    formaPago: 'en cuotas mensuales iguales',
    plazo: 'seis (6) meses',
    fecha: '6 de abril de 2026',
    clausulasExtra: [['PROTECCIÓN DE DATOS DE PACIENTES', 'EL CONSULTOR no accederá a expedientes clínicos identificados. Toda muestra de documentos le será entregada con los datos personales del paciente suprimidos.']],
  })),
  A('contrato-consultoria-agroexport-2026.md', 'mgarcia', '/Contratos/Clientes/2026', ['contrato', 'cliente', 'agroexport', '2026'], () => contrato({
    titulo: 'Contrato de consultoría para certificación de exportaciones',
    codigo: 'LEG-CT-2026-011',
    cliente: 'Agroexport Valle Verde, S.A.',
    nitCliente: '3322110-5',
    representante: 'Lic. Héctor Ramírez Solís',
    objeto: 'Acompañamiento para obtener la certificación de buenas prácticas agrícolas exigida por los compradores de la Unión Europea.',
    entregables: ['Brecha frente a la norma (mes 1)', 'Plan de cierre de brechas (mes 2)', 'Auditoría interna previa a la certificación (mes 5)'],
    monto: 248000,
    formaPago: 'con un anticipo del 20 % y el resto en cuatro pagos trimestrales',
    plazo: 'doce (12) meses',
    fecha: '12 de mayo de 2026',
  })),
  A('adenda-01-agroexport-2026.txt', 'mgarcia', '/Contratos/Clientes/2026', ['adenda', 'agroexport', '2026'], () => `ADENDA No. 1 AL CONTRATO LEG-CT-2026-011
${EMPRESA} — Agroexport Valle Verde, S.A.
Ciudad de Guatemala, 18 de junio de 2026

ANTECEDENTES
El 12 de mayo de 2026 las partes firmaron el contrato LEG-CT-2026-011 para el
acompañamiento en la certificación de buenas prácticas agrícolas.

MODIFICACIÓN
1. Se amplía el alcance para incluir la finca "El Naranjal", con lo que el
   número de unidades productivas pasa de dos a tres.
2. Como consecuencia, los honorarios aumentan en ${quetzales(42000)} más IVA,
   que se sumarán en partes iguales a los pagos trimestrales pendientes.
3. El plazo del contrato no se modifica.

Las demás cláusulas del contrato original se mantienen sin cambios.

_________________________                 _________________________
María Fernanda García Ruiz                Lic. Héctor Ramírez Solís
`),
  A('contrato-auditoria-inmobiliaria-norte-2026.md', 'mgarcia', '/Contratos/Clientes/2026', ['contrato', 'cliente', 'auditoria', '2026'], () => contrato({
    titulo: 'Contrato de auditoría de procesos administrativos',
    codigo: 'LEG-CT-2026-014',
    cliente: 'Inmobiliaria Norte Grande, S.A.',
    nitCliente: '6655443-1',
    representante: 'Arq. Luisa Fernández Rivas',
    objeto: 'Auditoría de los procesos de cobro de arrendamientos, mantenimiento de inmuebles y gestión de proveedores.',
    entregables: ['Plan de auditoría', 'Informe de hallazgos', 'Plan de acción acordado con la gerencia'],
    monto: 132000,
    formaPago: 'en dos pagos del 50 %',
    plazo: 'tres (3) meses',
    fecha: '22 de junio de 2026',
  })),
  A('acuerdo-confidencialidad-agroexport.txt', 'mgarcia', '/Contratos/Clientes/2026', ['confidencialidad', 'agroexport'], () => `ACUERDO DE CONFIDENCIALIDAD
Entre ${EMPRESA} y Agroexport Valle Verde, S.A.
Ciudad de Guatemala, 12 de mayo de 2026

1. INFORMACIÓN CONFIDENCIAL. Se considera confidencial toda información
   técnica, comercial o financiera que una parte entregue a la otra, incluidos
   listados de compradores, precios de exportación y resultados de laboratorio.
2. OBLIGACIONES. La parte receptora usará la información solo para los fines
   del contrato LEG-CT-2026-011 y la compartirá únicamente con el personal que
   la necesite para ejecutarlo.
3. EXCEPCIONES. No es confidencial la información que ya era pública o que deba
   entregarse por orden de autoridad competente.
4. VIGENCIA. Este acuerdo rige durante el contrato y tres (3) años después.
5. DEVOLUCIÓN. Al terminar el contrato, la parte receptora devolverá o
   destruirá la información recibida y lo confirmará por escrito.
`),
  A('contrato-mantenimiento-equipos-tecnoservice.txt', 'mgarcia', '/Contratos/Proveedores', ['contrato', 'proveedor', 'mantenimiento'], () => contratoTexto({
    titulo: 'Contrato de mantenimiento preventivo y correctivo de equipos',
    codigo: 'LEG-PR-2026-002',
    proveedor: 'TecnoService, Ltda.',
    nitProveedor: '1239874-6',
    objeto: 'Mantenimiento preventivo trimestral y correctivo a demanda de los equipos de cómputo, impresoras y red de la oficina.',
    condiciones: [
      'Visita preventiva trimestral programada con una semana de anticipación.',
      'Atención de fallas en un máximo de 8 horas hábiles desde el reporte.',
      'Equipo de reemplazo cuando la reparación supere 3 días hábiles.',
      'Informe escrito de cada visita con el detalle de lo revisado.',
    ],
    monto: 3200,
    periodicidad: 'mensuales',
    plazo: 'Doce meses a partir del 1 de abril de 2026',
    fecha: '27 de marzo de 2026',
  })),
  A('contrato-limpieza-serviclean.txt', 'mgarcia', '/Contratos/Proveedores', ['contrato', 'proveedor', 'limpieza'], () => contratoTexto({
    titulo: 'Contrato de servicios de limpieza',
    codigo: 'LEG-PR-2026-003',
    proveedor: 'ServiClean Guatemala, S.A.',
    nitProveedor: '8812345-0',
    objeto: 'Limpieza diaria de las oficinas, sala de reuniones y áreas comunes.',
    condiciones: [
      'Servicio de lunes a viernes de 6:30 a 9:30.',
      'Limpieza profunda de alfombras una vez al mes.',
      'Los insumos de limpieza corren por cuenta del proveedor.',
      'El personal del proveedor portará identificación visible.',
    ],
    monto: 5600,
    periodicidad: 'mensuales',
    plazo: 'Doce meses a partir del 15 de abril de 2026',
    fecha: '8 de abril de 2026',
  })),
  A('orden-servicio-papeleria-2026-04.txt', 'mgarcia', '/Contratos/Proveedores', ['orden', 'proveedor'], () => `ORDEN DE SERVICIO OS-2026-017
Proveedor: Librería y Papelería La Económica
Fecha: 20 de abril de 2026

Cant.  Descripción                         Precio unit.      Total
-------------------------------------------------------------------
  20   Resma papel bond carta 80 g          Q 42.00          Q 840.00
  10   Cartapacio tamaño oficio             Q 18.50          Q 185.00
   5   Caja de folders manila carta         Q 65.00          Q 325.00
   2   Sello fechador automático            Q 210.00         Q 420.00
-------------------------------------------------------------------
                                            TOTAL          Q 1,770.00

Entrega en recepción a más tardar el 24 de abril.
`),
  A('acta-reunion-directorio-2026-03.md', 'mgarcia', '/Actas', ['acta', 'directorio', '2026'], () => acta({
    titulo: 'Acta de reunión de directorio — marzo 2026',
    numero: '03-2026',
    fecha: '16 de marzo de 2026',
    hora: '9:00 horas',
    lugar: 'Sala de reuniones, oficinas centrales',
    asistentes: ['Gerencia General', 'María Fernanda García Ruiz (Asesoría Legal, secretaria)', 'Jorge Luis López Torres (Finanzas)', 'Carmen Pérez Vargas (Recursos Humanos)'],
    agenda: ['Aprobación del acta anterior', 'Resultados financieros de febrero', 'Implementación del sistema documental', 'Varios'],
    desarrollo: [
      ['Resultados financieros de febrero', 'Finanzas presenta ingresos un 6 % por encima de lo presupuestado, explicados por el adelanto del contrato con Transportes Del Sur.'],
      ['Implementación del sistema documental', 'Administración informa que el sistema documental quedó disponible para todo el personal. Se acuerda migrar los contratos vigentes antes de fin de abril.'],
    ],
    acuerdos: [
      ['Migrar los contratos vigentes al sistema documental', 'Asesoría Legal', '30/04/2026'],
      ['Presentar presupuesto anual ajustado', 'Finanzas', '31/03/2026'],
      ['Actualizar el reglamento interno', 'Recursos Humanos', '30/04/2026'],
    ],
    proximaReunion: '15 de junio de 2026',
  })),
  A('acta-reunion-directorio-2026-06.md', 'mgarcia', '/Actas', ['acta', 'directorio', '2026'], () => acta({
    titulo: 'Acta de reunión de directorio — junio 2026',
    numero: '06-2026',
    fecha: '15 de junio de 2026',
    hora: '9:00 horas',
    lugar: 'Sala de reuniones, oficinas centrales',
    asistentes: ['Gerencia General', 'María Fernanda García Ruiz (Asesoría Legal, secretaria)', 'Jorge Luis López Torres (Finanzas)', 'Carmen Pérez Vargas (Recursos Humanos)', 'Andrés Salazar Medina (Administración)'],
    agenda: ['Aprobación del acta 03-2026', 'Avance del proyecto ERP', 'Flujo de caja del semestre', 'Nuevos clientes'],
    desarrollo: [
      ['Avance del proyecto ERP', 'Recursos Humanos, a cargo del proyecto, informa que se cerró la fase de levantamiento de requisitos con una semana de atraso por la disponibilidad de los usuarios clave.'],
      ['Flujo de caja del semestre', 'Finanzas advierte que dos clientes acumulan más de 60 días de atraso. Se instruye a Asesoría Legal enviar requerimiento formal de pago.'],
      ['Nuevos clientes', 'Se firmaron los contratos con Agroexport Valle Verde e Inmobiliaria Norte Grande.'],
    ],
    acuerdos: [
      ['Enviar requerimientos de pago a clientes con atraso', 'Asesoría Legal', '30/06/2026'],
      ['Presentar presupuesto del tercer trimestre por área', 'Finanzas', '15/07/2026'],
      ['Ajustar el cronograma del ERP', 'Recursos Humanos', '30/06/2026'],
    ],
    proximaReunion: '14 de septiembre de 2026',
  })),
  A('acta-comite-legal-2026-05.txt', 'mgarcia', '/Actas', ['acta', 'comite-legal'], () => minuta({
    titulo: 'Acta del comité legal — mayo 2026',
    fecha: '8 de mayo de 2026',
    participantes: ['María Fernanda García Ruiz', 'Gerencia General', 'Asesor externo Lic. Fernando Ochoa'],
    avances: [
      'Se revisó la plantilla de contrato de servicios; se agregará cláusula de protección de datos.',
      'Se concluyó la migración de los contratos vigentes al sistema documental.',
    ],
    pendientes: [
      'Revisar la propuesta de contrato con Agroexport Valle Verde antes del 12 de mayo.',
      'Definir el procedimiento de firma electrónica para contratos con proveedores.',
    ],
    riesgos: ['El contrato de arrendamiento de la oficina vence en diciembre y aún no hay propuesta de renovación.'],
    siguientePaso: 'Reunión con el arrendador en la segunda quincena de mayo.',
  })),
  A('borrador-contrato-arrendamiento.txt', 'mgarcia', '/Borradores', ['borrador', 'arrendamiento'], () => `BORRADOR — NO USAR
Contrato de arrendamiento de oficinas (renovación 2027)

Pendiente de confirmar con el arrendador:
- Monto mensual: se propone mantener ${quetzales(18500)} con ajuste anual del 3 %.
- Plazo: tres años.
- Parqueos: solicitar dos espacios adicionales.
- Depósito: un mes de renta.

Notas: el arrendador pidió que el contrato se firme en escritura pública.
`),
  A('borrador-politica-privacidad-v1.md', 'mgarcia', '/Borradores/Antiguos', ['borrador', 'privacidad'], () => `# Política de privacidad (borrador v1)

> Versión descartada. La política vigente se trabajará con el formato de políticas de Recursos Humanos.

## Datos que se recopilan

- Datos de contacto de clientes y proveedores.
- Datos del personal necesarios para la relación laboral.

## Finalidad

Los datos se usan solo para prestar los servicios contratados y cumplir obligaciones legales.

## Derechos

Cualquier persona puede solicitar acceso, corrección o eliminación de sus datos escribiendo a Asesoría Legal.
`),
  A('notas-pendientes-legal.txt', 'mgarcia', null, ['notas', 'pendientes'], () => notas({
    titulo: 'PENDIENTES — ASESORÍA LEGAL',
    fecha: '27 de julio de 2026',
    bloques: [
      ['Esta semana', ['Enviar adenda firmada a Agroexport', 'Responder consulta de Clínica Santa Rosa sobre plazos', 'Revisar factura duplicada que reportó Finanzas']],
      ['Este mes', ['Propuesta de renovación del arrendamiento', 'Actualizar plantilla de contrato con cláusula de datos personales']],
      ['Cuando haya tiempo', ['Depurar la carpeta de borradores']],
    ],
  })),

  // ======================= jlopez =======================
  A('politica-gastos-viaje.md', 'jlopez', '/Finanzas', ['politica', 'gastos', 'viaticos'], () => politica({
    titulo: 'Política de gastos de viaje y viáticos',
    codigo: 'FIN-PO-002',
    version: '2.1',
    vigencia: '1 de abril de 2026',
    aprobadoPor: 'Gerencia General',
    objetivo: 'Establecer criterios claros para autorizar, ejecutar y liquidar los gastos de viaje del personal.',
    alcance: 'Todo el personal que viaje dentro o fuera del país por encargo de la organización.',
    secciones: [
      ['Montos máximos diarios', tablaMarkdown(['Concepto', 'Interior del país', 'Exterior'], [
        ['Hospedaje', quetzales(650), 'USD 150'],
        ['Alimentación', quetzales(250), 'USD 60'],
        ['Transporte local', quetzales(150), 'USD 40'],
      ])],
      ['Autorización', ['Todo viaje se solicita con 5 días hábiles de anticipación.', 'Los viajes al exterior requieren aprobación de la Gerencia General.']],
      ['Liquidación', 'Los gastos se liquidan dentro de los 5 días hábiles siguientes al regreso, con facturas a nombre de la organización. Los gastos sin factura no se reembolsan.'],
    ],
    responsables: ['Finanzas: revisar y reembolsar.', 'Jefe inmediato: autorizar la solicitud.', 'Colaborador: liquidar en plazo.'],
  })),
  A('calendario-cierres-contables-2026.md', 'jlopez', '/Finanzas', ['calendario', 'contabilidad', '2026'], () => `# Calendario de cierres contables 2026

${tablaMarkdown(['Mes', 'Corte de facturación', 'Cierre contable', 'Entrega de estados financieros'], [
  ['Marzo', '27/03', '06/04', '10/04'],
  ['Abril', '28/04', '07/05', '12/05'],
  ['Mayo', '27/05', '05/06', '10/06'],
  ['Junio', '26/06', '07/07', '10/07'],
  ['Julio', '28/07', '06/08', '11/08'],
  ['Agosto', '27/08', '07/09', '10/09'],
  ['Septiembre', '28/09', '07/10', '12/10'],
  ['Octubre', '28/10', '06/11', '11/11'],
  ['Noviembre', '27/11', '07/12', '10/12'],
  ['Diciembre', '18/12', '12/01/2027', '20/01/2027'],
])}

**Recordatorios**

- Las facturas que lleguen después del corte se registran en el mes siguiente.
- Las liquidaciones de viáticos deben estar aprobadas antes del corte.
- El cierre de diciembre incluye la declaración anual de ISR.
`),
  A('presupuesto-anual-2026.md', 'jlopez', '/Finanzas/Presupuestos', ['presupuesto', '2026'], () => {
    const filas = [
      ['Honorarios por consultoría', 2450000, 2310000],
      ['Auditorías', 620000, 540000],
      ['Capacitaciones a clientes', 180000, 150000],
    ];
    const gastos = [
      ['Planilla y prestaciones', 1680000],
      ['Arrendamiento de oficinas', 222000],
      ['Tecnología y licencias', 145000],
      ['Servicios contratados', 106000],
      ['Capacitación del personal', 60000],
      ['Gastos de viaje', 85000],
    ];
    const totalIngresos = filas.reduce((s, f) => s + f[1], 0);
    const totalGastos = gastos.reduce((s, g) => s + g[1], 0);
    return `# Presupuesto anual 2026

**Versión:** ajustada, aprobada en directorio de marzo
**Responsable:** Jorge Luis López Torres

## Ingresos

${tablaMarkdown(['Concepto', 'Presupuesto 2026', 'Real 2025'], filas.map(([c, p, r]) => [c, quetzales(p), quetzales(r)]))}

**Total de ingresos presupuestados:** ${quetzales(totalIngresos)}

## Gastos

${tablaMarkdown(['Concepto', 'Presupuesto 2026', '% del total'], gastos.map(([c, m]) => [c, quetzales(m), `${((m / totalGastos) * 100).toFixed(1)} %`]))}

**Total de gastos presupuestados:** ${quetzales(totalGastos)}

## Resultado esperado

Utilidad antes de impuestos: **${quetzales(totalIngresos - totalGastos)}** (margen del ${(((totalIngresos - totalGastos) / totalIngresos) * 100).toFixed(1)} %).

Ver supuestos detallados en \`supuestos-presupuesto-2026.txt\`.
`;
  }),
  A('supuestos-presupuesto-2026.txt', 'jlopez', '/Finanzas/Presupuestos', ['presupuesto', 'supuestos'], () => `SUPUESTOS DEL PRESUPUESTO 2026

1. Tipo de cambio de referencia: Q 7.75 por dólar.
2. Inflación esperada: 4 % anual; se aplica a arrendamiento y servicios.
3. Planilla: incremento salarial del 5 % a partir de julio.
4. Clientes: se mantienen los 9 clientes de 2025 y se suman 3 nuevos.
5. Cobranza: plazo promedio de 45 días; se estima un 2 % de incobrables.
6. No se contemplan nuevas contrataciones de personal fijo.

Nota: este documento se reemplazó por la sección de supuestos del informe de
ejecución trimestral.
`),
  A('presupuesto-q3-area-legal.txt', 'jlopez', '/Finanzas/Presupuestos/Q3', ['presupuesto', 'q3', 'legal'], () => presupuestoTexto({
    titulo: 'Presupuesto del tercer trimestre — Asesoría Legal',
    area: 'Asesoría Legal',
    periodo: 'Julio a septiembre de 2026',
    responsable: 'María Fernanda García Ruiz',
    partidas: [
      ['Asesor externo (iguala mensual)', 27000],
      ['Gastos notariales y registrales', 8500],
      ['Suscripción a base de jurisprudencia', 4200],
      ['Capacitación en firma electrónica', 3500],
      ['Imprevistos', 2000],
    ],
    comentario: 'Los gastos notariales aumentan por la renovación del contrato de arrendamiento.',
  })),
  A('presupuesto-q3-area-tecnologia.txt', 'jlopez', '/Finanzas/Presupuestos/Q3', ['presupuesto', 'q3', 'tecnologia'], () => presupuestoTexto({
    titulo: 'Presupuesto del tercer trimestre — Tecnología',
    area: 'Administración y sistemas',
    periodo: 'Julio a septiembre de 2026',
    responsable: 'Andrés Salazar Medina',
    partidas: [
      ['Licencias de software', 18600],
      ['Mantenimiento TecnoService', 9600],
      ['Reemplazo de batería UPS', 3900],
      ['Servicio de internet', 4500],
      ['Proyecto ERP (fase de configuración)', 42000],
    ],
    comentario: 'La partida del ERP es la de mayor riesgo: depende de que se cumpla el cronograma.',
  })),
  A('informe-ejecucion-q3.md', 'jlopez', '/Finanzas/Presupuestos/Q3', ['informe', 'q3', 'ejecucion'], () => informe({
    titulo: 'Informe de ejecución presupuestaria — tercer trimestre 2026',
    fecha: '9 de octubre de 2026',
    autor: 'Jorge Luis López Torres, Finanzas',
    resumen: 'Al cierre de septiembre se ejecutó el 93 % del presupuesto de gastos del trimestre, con ingresos un 4 % por encima de lo previsto.',
    secciones: [
      ['Ejecución por área', tablaMarkdown(['Área', 'Presupuesto', 'Ejecutado', '%'], [
        ['Asesoría Legal', quetzales(45200), quetzales(41800), '92.5 %'],
        ['Tecnología', quetzales(78600), quetzales(74100), '94.3 %'],
        ['Recursos Humanos', quetzales(36000), quetzales(33300), '92.5 %'],
      ])],
      ['Desviaciones relevantes', 'La partida del proyecto ERP se ejecutó por completo; el atraso de junio se recuperó en agosto. Los gastos notariales quedaron por debajo de lo previsto porque la renovación del arrendamiento se trasladó a noviembre.'],
    ],
    conclusiones: [
      'Trasladar al cuarto trimestre el saldo de gastos notariales.',
      'Mantener el seguimiento quincenal del gasto del ERP hasta su puesta en marcha.',
    ],
  })),
  A('factura-F001-000231.txt', 'jlopez', '/Finanzas/Facturas', ['factura', 'transportes-del-sur'], () => factura({
    serie: 'F001', numero: '000231', fecha: '15 de abril de 2026',
    cliente: 'Transportes Del Sur, S.A.', nitCliente: '4561237-8', direccion: 'Km 14.5 Carretera al Pacífico, Villa Nueva',
    lineas: [['Consultoría procesos logísticos — entregable 1', 1, 62496]],
    observaciones: 'Primer pago (30 %) del contrato LEG-CT-2026-003.',
  })),
  A('factura-F001-000232.txt', 'jlopez', '/Finanzas/Facturas', ['factura', 'clinica-santa-rosa'], () => factura({
    serie: 'F001', numero: '000232', fecha: '30 de abril de 2026',
    cliente: 'Clínica Santa Rosa, S.A.', nitCliente: '7788123-4', direccion: '3a. Calle 5-20, Zona 1, Ciudad de Guatemala',
    lineas: [['Asesoría administrativa — cuota abril', 1, 17640]],
    observaciones: 'Cuota 1 de 6 del contrato LEG-CT-2026-005.',
  })),
  A('factura-F001-000245.txt', 'jlopez', '/Finanzas/Facturas', ['factura', 'agroexport'], () => factura({
    serie: 'F001', numero: '000245', fecha: '19 de junio de 2026',
    cliente: 'Agroexport Valle Verde, S.A.', nitCliente: '3322110-5', direccion: 'Finca Valle Verde, Escuintla',
    lineas: [
      ['Anticipo contrato LEG-CT-2026-011 (20 %)', 1, 55552],
      ['Taller de diagnóstico en finca', 2, 3800],
    ],
    observaciones: 'Anticipo según cláusula tercera del contrato.',
  })),
  A('nota-credito-NC01-000018.txt', 'jlopez', '/Finanzas/Facturas', ['nota-credito', 'clinica-santa-rosa'], () => factura({
    tipo: 'NOTA DE CRÉDITO', serie: 'NC01', numero: '000018', fecha: '24 de junio de 2026',
    cliente: 'Clínica Santa Rosa, S.A.', nitCliente: '7788123-4', direccion: '3a. Calle 5-20, Zona 1, Ciudad de Guatemala',
    referencia: 'Factura F001-000232',
    lineas: [['Descuento por pronto pago (5 %)', 1, 882]],
    observaciones: 'Descuento acordado por pago anticipado de la cuota de abril.',
  })),
  A('registro-facturas-pendientes.md', 'jlopez', '/Finanzas/Facturas', ['registro', 'cobranza'], () => `# Registro de facturas pendientes de cobro

Corte: 14 de agosto de 2026

${tablaMarkdown(['Factura', 'Cliente', 'Emisión', 'Monto', 'Días de atraso', 'Acción'], [
  ['F001-000238', 'Transportes Del Sur', '29/05/2026', quetzales(83328), '47', 'Segundo recordatorio enviado'],
  ['F001-000241', 'Clínica Santa Rosa', '30/05/2026', quetzales(17640), '46', 'Promesa de pago 20/08'],
  ['F001-000249', 'Inmobiliaria Norte Grande', '30/06/2026', quetzales(73920), '15', 'En plazo de gracia'],
])}

**Total pendiente:** ${quetzales(83328 + 17640 + 73920)}

Los casos con más de 60 días pasan a Asesoría Legal para requerimiento formal.
`),
  A('informe-flujo-caja-junio.md', 'jlopez', null, ['informe', 'flujo-caja'], () => informe({
    titulo: 'Informe de flujo de caja — junio 2026',
    fecha: '3 de julio de 2026',
    autor: 'Jorge Luis López Torres, Finanzas',
    resumen: 'El saldo de caja al 30 de junio cubre 2.4 meses de gastos fijos. La cobranza del mes fue un 18 % menor a lo esperado por el atraso de dos clientes.',
    secciones: [
      ['Movimientos del mes', tablaMarkdown(['Concepto', 'Monto'], [
        ['Saldo inicial', quetzales(612400)],
        ['Cobros de clientes', quetzales(298700)],
        ['Pagos de planilla', `-${quetzales(141500)}`],
        ['Pagos a proveedores', `-${quetzales(48900)}`],
        ['Impuestos', `-${quetzales(36200)}`],
        ['Saldo final', quetzales(684500)],
      ])],
      ['Proyección de julio', 'Se espera recuperar el atraso de Transportes Del Sur tras el requerimiento enviado por Asesoría Legal.'],
    ],
    conclusiones: ['Mantener el seguimiento semanal de la cobranza.', 'No comprometer gastos no presupuestados hasta normalizar los cobros.'],
  })),

  // ======================= cperez =======================
  A('reglamento-interno-trabajo.md', 'cperez', '/Recursos Humanos', ['reglamento', 'rrhh'], () => politica({
    titulo: 'Reglamento interior de trabajo',
    codigo: 'RH-RE-001',
    version: '3.0',
    vigencia: '1 de abril de 2026',
    aprobadoPor: 'Gerencia General',
    objetivo: 'Regular las condiciones en que debe prestarse el trabajo, conforme al Código de Trabajo.',
    alcance: 'Todo el personal con relación laboral con la organización.',
    secciones: [
      ['Jornada de trabajo', 'La jornada ordinaria es de lunes a viernes de 8:00 a 17:00, con una hora para almorzar. El trabajo en horas extraordinarias requiere autorización previa del jefe inmediato.'],
      ['Puntualidad y ausencias', ['Las ausencias se notifican al jefe inmediato antes de las 9:00.', 'Las ausencias por enfermedad de más de un día se justifican con constancia médica.']],
      ['Obligaciones del personal', ['Cumplir las políticas internas.', 'Guardar confidencialidad sobre la información de clientes.', 'Cuidar los equipos asignados.']],
      ['Faltas y sanciones', 'Las faltas se clasifican en leves, graves y muy graves. Las sanciones van desde la amonestación verbal hasta la terminación del contrato, según la gravedad y la reincidencia.'],
    ],
    responsables: ['Recursos Humanos: difundir y velar por el cumplimiento.', 'Jefes de área: aplicar el reglamento en su equipo.'],
  })),
  A('plan-capacitacion-2026.md', 'cperez', '/Recursos Humanos', ['plan', 'capacitacion', '2026'], () => `# Plan de capacitación 2026

**Presupuesto asignado:** ${quetzales(60000)}

${tablaMarkdown(['Tema', 'Dirigido a', 'Modalidad', 'Mes', 'Costo estimado'], [
  ['Uso del sistema documental', 'Todo el personal', 'Presencial interna', 'Marzo', quetzales(0)],
  ['Firma electrónica y contratos digitales', 'Asesoría Legal', 'Virtual', 'Agosto', quetzales(3500)],
  ['Excel avanzado para análisis financiero', 'Finanzas', 'Virtual', 'Mayo', quetzales(4800)],
  ['Gestión de proyectos (fundamentos)', 'Líderes de proyecto', 'Presencial externa', 'Junio', quetzales(12500)],
  ['Atención al cliente', 'Todo el personal', 'Presencial interna', 'Octubre', quetzales(6000)],
  ['Seguridad de la información', 'Todo el personal', 'Virtual', 'Noviembre', quetzales(5200)],
])}

## Criterios

- Cada colaborador debe completar al menos 24 horas de capacitación al año.
- Las capacitaciones externas de más de ${quetzales(5000)} requieren compromiso de permanencia.
- Al finalizar cada curso, el participante comparte un resumen con su equipo.
`),
  A('politica-teletrabajo.md', 'cperez', '/Recursos Humanos/Políticas', ['politica', 'teletrabajo', 'rrhh'], () => politica({
    titulo: 'Política de teletrabajo',
    codigo: 'RH-PO-007',
    version: '1.2',
    vigencia: '16 de marzo de 2026',
    aprobadoPor: 'Gerencia General',
    objetivo: 'Definir las condiciones en que el personal puede trabajar a distancia sin afectar la calidad del servicio.',
    alcance: 'Puestos cuyas funciones pueden realizarse fuera de la oficina, a criterio del jefe inmediato.',
    secciones: [
      ['Modalidad', 'Se permite un máximo de dos días de teletrabajo por semana, acordados con el jefe inmediato con al menos un día de anticipación.'],
      ['Requisitos', ['Conexión a internet estable.', 'Disponibilidad en el horario ordinario por correo y teléfono.', 'Uso del sistema documental para todos los archivos de trabajo; no se guardan documentos de clientes en equipos personales.']],
      ['Seguridad de la información', 'Los equipos deben tener contraseña y bloqueo automático. Está prohibido trabajar con información de clientes en redes públicas sin VPN.'],
    ],
    responsables: ['Jefe inmediato: autorizar y dar seguimiento.', 'Recursos Humanos: registrar los acuerdos de teletrabajo.'],
  })),
  A('politica-vacaciones.md', 'cperez', '/Recursos Humanos/Políticas', ['politica', 'vacaciones', 'rrhh'], () => politica({
    titulo: 'Política de vacaciones',
    codigo: 'RH-PO-003',
    version: '2.0',
    vigencia: '1 de abril de 2026',
    aprobadoPor: 'Gerencia General',
    objetivo: 'Ordenar la programación de vacaciones para garantizar el descanso del personal y la continuidad del servicio.',
    alcance: 'Todo el personal con más de un año de servicio continuo.',
    secciones: [
      ['Derecho', 'Cada colaborador tiene derecho a quince (15) días hábiles de vacaciones remuneradas por año de servicio, que no son compensables en dinero salvo al terminar la relación laboral.'],
      ['Programación', ['Las vacaciones se solicitan con 15 días de anticipación.', 'No pueden coincidir en vacaciones más de dos personas de la misma área.', 'Diciembre se reserva para el cierre contable en el área de Finanzas.']],
    ],
    responsables: ['Recursos Humanos: llevar el control de saldos.', 'Jefe inmediato: aprobar las fechas.'],
  })),
  A('codigo-de-etica.md', 'cperez', '/Recursos Humanos/Políticas', ['codigo', 'etica', 'rrhh'], () => politica({
    titulo: 'Código de ética y conducta',
    codigo: 'RH-CO-001',
    version: '1.0',
    vigencia: '1 de abril de 2026',
    aprobadoPor: 'Junta Directiva',
    objetivo: 'Establecer los principios que guían la conducta del personal con clientes, proveedores y compañeros.',
    alcance: 'Todo el personal, asesores externos y practicantes.',
    secciones: [
      ['Principios', ['Integridad: actuar con honestidad aun cuando nadie observa.', 'Confidencialidad: la información de los clientes no se comparte fuera del equipo de trabajo.', 'Respeto: no se tolera ninguna forma de acoso ni discriminación.', 'Independencia: declarar cualquier conflicto de interés antes de aceptar un encargo.']],
      ['Regalos y atenciones', `No se aceptan regalos de clientes o proveedores con valor superior a ${quetzales(300)}. Las atenciones de mayor valor se informan a Recursos Humanos.`],
      ['Denuncias', 'Cualquier incumplimiento puede reportarse de forma confidencial a Recursos Humanos o directamente a la Gerencia General. No habrá represalias contra quien denuncie de buena fe.'],
    ],
    responsables: ['Todo el personal: conocer y cumplir este código.', 'Recursos Humanos: atender las denuncias.'],
  })),
  A('procedimiento-onboarding.txt', 'cperez', '/Recursos Humanos/Políticas', ['procedimiento', 'onboarding', 'rrhh'], () => procedimientoTexto({
    titulo: 'Procedimiento de incorporación de personal nuevo',
    codigo: 'RH-PR-002',
    objetivo: 'Que toda persona que se incorpora tenga en su primera semana el equipo, los accesos y la información que necesita.',
    pasos: [
      ['RRHH', 'Enviar al nuevo colaborador la carta de bienvenida y la lista de documentos para su expediente.'],
      ['Administración', 'Preparar equipo de cómputo y crear su usuario en el sistema documental.'],
      ['RRHH', 'Primer día: entrega del reglamento interno, el código de ética y la política de teletrabajo.'],
      ['Jefe inmediato', 'Presentar al equipo y explicar los objetivos del puesto.'],
      ['Administración', 'Capacitación en el uso del sistema documental (1 hora).'],
      ['RRHH', 'Al finalizar el primer mes, entrevista de seguimiento.'],
    ],
    notas: ['El usuario del sistema se crea con rol USUARIO; solo Administración tiene rol ADMINISTRADOR.', 'Si el colaborador maneja información de clientes, firma el acuerdo de confidencialidad el primer día.'],
  })),
  A('cartera-proyectos-2026.md', 'cperez', '/Proyectos', ['proyectos', 'cartera', '2026'], () => `# Cartera de proyectos internos 2026

${tablaMarkdown(['Proyecto', 'Líder', 'Inicio', 'Fin previsto', 'Estado', 'Prioridad'], [
  ['Implementación del sistema documental', 'Andrés Salazar', '02/2026', '03/2026', 'Terminado', 'Alta'],
  ['Implementación ERP', 'Carmen Pérez', '05/2026', '12/2026', 'En curso', 'Alta'],
  ['Actualización de políticas de RRHH', 'Carmen Pérez', '03/2026', '06/2026', 'Terminado', 'Media'],
  ['Firma electrónica de contratos', 'María Fernanda García', '08/2026', '11/2026', 'Planificado', 'Media'],
  ['Tablero de indicadores financieros', 'Jorge Luis López', '09/2026', '12/2026', 'Planificado', 'Baja'],
])}

## Criterios de priorización

1. Impacto en el servicio al cliente.
2. Obligaciones legales o fiscales.
3. Ahorro de tiempo del personal.
`),
  A('acta-constitucion-proyecto-erp.md', 'cperez', '/Proyectos/Implementación ERP', ['erp', 'proyecto', 'acta-constitucion'], () => `# Acta de constitución del proyecto — Implementación ERP

**Patrocinador:** Gerencia General
**Líder del proyecto:** Carmen Pérez Vargas
**Fecha:** 25 de mayo de 2026

## Justificación

Hoy la facturación, la planilla y la contabilidad se llevan en hojas de cálculo separadas. Esto obliga a digitar dos veces la misma información y provoca diferencias en los cierres mensuales.

## Objetivo

Implementar un sistema ERP que integre facturación, contabilidad y planilla antes del cierre contable de diciembre de 2026.

## Alcance

**Incluye:** módulos de facturación electrónica, contabilidad general, cuentas por cobrar y planilla.
**No incluye:** inventarios ni compras (fase 2, en 2027).

## Presupuesto

${quetzales(168000)} entre licencias, configuración y capacitación.

## Equipo

${tablaMarkdown(['Rol', 'Persona'], [
  ['Líder del proyecto', 'Carmen Pérez Vargas'],
  ['Usuario clave — Finanzas', 'Jorge Luis López Torres'],
  ['Soporte técnico', 'Andrés Salazar Medina'],
  ['Revisión de contratos con el proveedor', 'María Fernanda García Ruiz'],
])}

## Hitos

1. Levantamiento de requisitos — junio
2. Configuración y migración de datos — julio a septiembre
3. Pruebas con usuarios — octubre
4. Puesta en marcha — noviembre
`),
  A('cronograma-erp.txt', 'cperez', '/Proyectos/Implementación ERP', ['erp', 'cronograma'], () => `CRONOGRAMA — IMPLEMENTACIÓN ERP (versión 2, ajustada en junio)

SEM.  FECHAS              ACTIVIDAD                                      RESPONSABLE
------------------------------------------------------------------------------------------
 1-4  01/06 - 26/06       Levantamiento de requisitos                    C. Pérez
 5    29/06 - 03/07       Validación de requisitos con usuarios clave    J. López
 6-9  06/07 - 31/07       Configuración de facturación y contabilidad    Proveedor
10-12 03/08 - 21/08       Configuración de planilla                      Proveedor
13-15 24/08 - 11/09       Migración de saldos y catálogos                A. Salazar / J. López
16-18 14/09 - 02/10       Ajustes y reportes                             Proveedor
19-21 05/10 - 23/10       Pruebas con usuarios                           C. Pérez
22    26/10 - 30/10       Capacitación final                             Proveedor
23    02/11               Puesta en marcha                               Todos

Cambio respecto de la versión 1: se agregó la semana 5 de validación porque los
usuarios clave no estuvieron disponibles durante el levantamiento.
`),
  A('matriz-riesgos-erp.md', 'cperez', '/Proyectos/Implementación ERP', ['erp', 'riesgos'], () => `# Matriz de riesgos — Implementación ERP

${tablaMarkdown(['ID', 'Riesgo', 'Probabilidad', 'Impacto', 'Respuesta', 'Responsable'], [
  ['R1', 'Usuarios clave sin tiempo para el proyecto', 'Alta', 'Alto', 'Bloquear dos mañanas por semana en su agenda', 'C. Pérez'],
  ['R2', 'Datos históricos con errores al migrar', 'Media', 'Alto', 'Depurar catálogos antes de la migración', 'J. López'],
  ['R3', 'Retraso del proveedor en la configuración', 'Media', 'Medio', 'Penalización por atraso en el contrato', 'M. García'],
  ['R4', 'Resistencia al cambio del personal', 'Media', 'Medio', 'Capacitación temprana y acompañamiento', 'C. Pérez'],
  ['R5', 'Falla de conectividad el día de puesta en marcha', 'Baja', 'Alto', 'Enlace de internet de respaldo', 'A. Salazar'],
])}

Revisión: quincenal, en la reunión de seguimiento del proyecto.
`),
  A('minuta-seguimiento-erp-01.txt', 'cperez', '/Proyectos/Implementación ERP', ['erp', 'minuta', 'seguimiento'], () => minuta({
    titulo: 'Minuta de seguimiento ERP no. 1',
    fecha: '26 de junio de 2026',
    participantes: ['Carmen Pérez', 'Jorge Luis López', 'Andrés Salazar', 'Consultor del proveedor'],
    avances: ['Se completó el levantamiento de requisitos de facturación y contabilidad.', 'El proveedor entregó el ambiente de pruebas.'],
    pendientes: ['Requisitos de planilla (falta reunión con RRHH).', 'Validar con Finanzas el catálogo de cuentas.'],
    riesgos: ['R1 se materializó: una semana de atraso por agenda de usuarios clave.'],
    siguientePaso: 'Aprobar la versión 2 del cronograma con una semana de validación adicional.',
  })),
  A('minuta-seguimiento-erp-02.txt', 'cperez', '/Proyectos/Implementación ERP', ['erp', 'minuta', 'seguimiento'], () => minuta({
    titulo: 'Minuta de seguimiento ERP no. 2',
    fecha: '24 de julio de 2026',
    participantes: ['Carmen Pérez', 'Jorge Luis López', 'Consultor del proveedor'],
    avances: ['Configuración de facturación electrónica al 80 %.', 'Catálogo de cuentas validado por Finanzas.'],
    pendientes: ['Pruebas de emisión de facturas con el certificador.', 'Definir formato de reportes de cuentas por cobrar.'],
    riesgos: [],
    siguientePaso: 'Iniciar configuración de planilla el 3 de agosto.',
  })),
  A('especificacion-requisitos-erp.md', 'cperez', '/Proyectos/Implementación ERP/Entregables', ['erp', 'requisitos', 'entregable'], () => `# Especificación de requisitos — ERP

**Versión:** 1.0 — aprobada el 10 de julio de 2026

## Requisitos funcionales

${tablaMarkdown(['ID', 'Módulo', 'Requisito', 'Prioridad'], [
  ['RF-01', 'Facturación', 'Emitir facturas electrónicas certificadas (FEL) con serie y correlativo', 'Obligatorio'],
  ['RF-02', 'Facturación', 'Emitir notas de crédito vinculadas a una factura', 'Obligatorio'],
  ['RF-03', 'Cuentas por cobrar', 'Reporte de antigüedad de saldos por cliente', 'Obligatorio'],
  ['RF-04', 'Contabilidad', 'Generar partidas automáticas desde facturación y planilla', 'Obligatorio'],
  ['RF-05', 'Contabilidad', 'Estados financieros mensuales comparativos', 'Obligatorio'],
  ['RF-06', 'Planilla', 'Cálculo de IGSS, ISR, bono 14 y aguinaldo', 'Obligatorio'],
  ['RF-07', 'Planilla', 'Constancias de ingresos para el personal', 'Deseable'],
])}

## Requisitos no funcionales

- Acceso por navegador desde la oficina y en teletrabajo.
- Respaldo diario de la información, coherente con el procedimiento ADM-PR-004.
- Roles y permisos por módulo.
- Tiempo de respuesta menor a 3 segundos en las consultas habituales.

## Fuera de alcance

Inventarios, compras y activos fijos (fase 2).
`),
  A('plan-pruebas-erp.md', 'cperez', '/Proyectos/Implementación ERP/Entregables', ['erp', 'pruebas', 'entregable'], () => `# Plan de pruebas — ERP

## Estrategia

Las pruebas las ejecutan los usuarios clave con casos reales de los últimos tres meses, en el ambiente de pruebas del proveedor.

## Casos de prueba principales

${tablaMarkdown(['Caso', 'Requisito', 'Descripción', 'Resultado esperado'], [
  ['CP-01', 'RF-01', 'Emitir factura a Transportes Del Sur', 'Factura certificada con número de autorización'],
  ['CP-02', 'RF-02', 'Nota de crédito sobre la factura F001-000232', 'Saldo del cliente disminuye en el monto de la nota'],
  ['CP-03', 'RF-03', 'Antigüedad de saldos al 31 de julio', 'Coincide con el registro manual de Finanzas'],
  ['CP-04', 'RF-06', 'Planilla de julio con un empleado de baja', 'Cálculo correcto de la liquidación'],
  ['CP-05', 'RF-05', 'Estado de resultados de junio', 'Diferencia menor a Q 1.00 con el cierre manual'],
])}

## Criterios de aceptación

- El 100 % de los casos obligatorios aprobados.
- Ningún defecto crítico abierto.
- Firma de conformidad de cada usuario clave.
`),
  A('informe-avance-erp-septiembre.md', 'cperez', '/Proyectos/Implementación ERP/Entregables', ['erp', 'informe', 'avance'], () => informe({
    titulo: 'Informe de avance — Implementación ERP',
    subtitulo: 'Corte al 18 de septiembre de 2026',
    fecha: '21 de septiembre de 2026',
    autor: 'Carmen Pérez Vargas, líder del proyecto',
    resumen: 'El proyecto avanza al 74 %, dentro del cronograma ajustado. Se completó la migración de saldos y catálogos; inicia la etapa de ajustes y reportes.',
    secciones: [
      ['Avance por etapa', tablaMarkdown(['Etapa', 'Avance', 'Estado'], [
        ['Levantamiento de requisitos', '100 %', 'Terminado'],
        ['Configuración de facturación y contabilidad', '100 %', 'Terminado'],
        ['Configuración de planilla', '100 %', 'Terminado'],
        ['Migración de saldos y catálogos', '100 %', 'Terminado'],
        ['Ajustes y reportes', '20 %', 'En curso'],
        ['Pruebas con usuarios', '0 %', 'Pendiente'],
      ])],
      ['Presupuesto', `Ejecutado ${quetzales(121000)} de ${quetzales(168000)} (72 %).`],
      ['Riesgos', 'R2 (datos con errores) se mitigó: la depuración previa redujo a 14 las diferencias de saldos, todas ya conciliadas.'],
    ],
    conclusiones: ['Mantener la fecha de puesta en marcha del 2 de noviembre.', 'Confirmar la disponibilidad de los usuarios clave para las pruebas de octubre.'],
  })),
  A('lista-tareas-semana.txt', 'cperez', null, ['notas', 'tareas'], () => notas({
    titulo: 'TAREAS DE LA SEMANA',
    fecha: '28 de septiembre de 2026',
    bloques: [
      ['Recursos Humanos', ['Cerrar evaluación de desempeño del primer semestre', 'Programar capacitación de atención al cliente', 'Revisar saldos de vacaciones']],
      ['Proyecto ERP', ['Enviar convocatoria a pruebas con usuarios', 'Revisar reportes de planilla con el proveedor']],
    ],
  })),

  // ===== jlopez — archivo que se sube por error y se elimina definitivamente =====
  // No existira al final: demuestra que el historial sigue siendo legible
  // gracias a `recursoNombre`, y que el almacenamiento se descuenta.
  A('factura-F001-000231-duplicado.txt', 'jlopez', '/Finanzas/Facturas', ['factura'], () => factura({
    serie: 'F001', numero: '000231', fecha: '15 de abril de 2026',
    cliente: 'Transportes Del Sur, S.A.', nitCliente: '4561237-8', direccion: 'Km 14.5 Carretera al Pacífico, Villa Nueva',
    lineas: [['Consultoría procesos logísticos — entregable 1', 1, 62496]],
    observaciones: 'Primer pago (30 %) del contrato LEG-CT-2026-003. COPIA DUPLICADA.',
  })),
];

// ---------------------------------------------------------------------------
// Linea de tiempo
// ---------------------------------------------------------------------------
// Cada mes agrupa sus operaciones en orden. seed.js reparte las operaciones de
// cada mes dentro del horario laboral (lunes a viernes, 8:00-17:30, hora de
// Guatemala), conservando el orden. El actor de una operacion sobre un recurso
// propio es su propietario; las descargas y lo que hace el administrador
// indican el actor explicitamente.

const crearUsuario = (username) => ({ tipo: 'CREAR_USUARIO', actor: 'admin', username });
const crearCarpeta = (clave, padreInicial) => ({ tipo: 'CREAR_CARPETA', clave, padreInicial });
const subir = (clave, opciones = {}) => ({ tipo: 'SUBIR', clave, ...opciones });
const descargar = (actor, clave) => ({ tipo: 'DESCARGAR', actor, clave });
const renombrar = (clave) => ({ tipo: 'RENOMBRAR', clave });
const moverArchivo = (clave) => ({ tipo: 'MOVER_ARCHIVO', clave });
const moverCarpeta = (clave) => ({ tipo: 'MOVER_CARPETA', clave });
const compartirArchivo = (clave, con, nivel) => ({ tipo: 'COMPARTIR', recursoTipo: 'ARCHIVO', clave, con, nivel });
const compartirCarpeta = (clave, con, nivel) => ({ tipo: 'COMPARTIR', recursoTipo: 'CARPETA', clave, con, nivel });
const revocarArchivo = (clave, con) => ({ tipo: 'REVOCAR', recursoTipo: 'ARCHIVO', clave, con });
const eliminarArchivo = (clave) => ({ tipo: 'ELIMINAR', clave });
const eliminarCarpeta = (clave) => ({ tipo: 'ELIMINAR_CARPETA', clave });
const restaurarArchivo = (clave) => ({ tipo: 'RESTAURAR', clave });
const eliminarDefinitivo = (clave) => ({ tipo: 'ELIMINAR_DEFINITIVO', clave });

export const INICIO_SIMULACION = '2026-03-02';
export const FIN_SIMULACION = '2026-10-16';

export const LINEA_DE_TIEMPO = [
  {
    mes: '2026-03',
    operaciones: [
      crearUsuario('mgarcia'),
      crearUsuario('jlopez'),
      crearUsuario('cperez'),
      crearCarpeta('/Administración'),
      crearCarpeta('/Administración/Manuales'),
      subir('manual-uso-sistema-documental.md'),
      subir('guia-buenas-practicas-nombres.md'),
      compartirCarpeta('/Administración/Manuales', 'mgarcia', 'LECTURA'),
      compartirCarpeta('/Administración/Manuales', 'jlopez', 'LECTURA'),
      compartirCarpeta('/Administración/Manuales', 'cperez', 'LECTURA'),
      descargar('mgarcia', 'manual-uso-sistema-documental.md'),
      descargar('cperez', 'manual-uso-sistema-documental.md'),
      crearCarpeta('/Contratos'),
      crearCarpeta('/Contratos/Clientes'),
      crearCarpeta('/Contratos/Proveedores'),
      descargar('jlopez', 'guia-buenas-practicas-nombres.md'),
      subir('plantilla-contrato-servicios.md'),
      subir('contrato-servicios-transportes-delsur.md'),
      crearCarpeta('/Finanzas'),
      crearCarpeta('/Finanzas/Presupuestos'),
      crearCarpeta('/Finanzas/Facturas'),
      crearCarpeta('/Recursos Humanos'),
      crearCarpeta('/Recursos Humanos/Políticas'),
      subir('politica-teletrabajo.md'),
      crearCarpeta('/Actas'),
      subir('acta-reunion-directorio-2026-03.md'),
      compartirCarpeta('/Actas', 'jlopez', 'LECTURA'),
      compartirCarpeta('/Actas', 'cperez', 'COMENTARIO'),
      descargar('jlopez', 'acta-reunion-directorio-2026-03.md'),
      subir('presupuesto-anual-2026.md'),
      subir('supuestos-presupuesto-2026.txt'),
      subir('calendario-cierres-contables-2026.md'),
      compartirArchivo('plantilla-contrato-servicios.md', 'cperez', 'EDICION'),
      compartirArchivo('plantilla-contrato-servicios.md', 'jlopez', 'LECTURA'),
      descargar('cperez', 'plantilla-contrato-servicios.md'),
      subir('contrato-mantenimiento-equipos-tecnoservice.txt'),
      subir('reglamento-interno-trabajo.md'),
    ],
  },
  {
    mes: '2026-04',
    operaciones: [
      compartirArchivo('contrato-mantenimiento-equipos-tecnoservice.txt', 'admin', 'COMENTARIO'),
      descargar('admin', 'contrato-mantenimiento-equipos-tecnoservice.txt'),
      subir('politica-gastos-viaje.md'),
      compartirArchivo('politica-gastos-viaje.md', 'cperez', 'LECTURA'),
      compartirArchivo('politica-gastos-viaje.md', 'mgarcia', 'LECTURA'),
      subir('contrato-servicios-clinica-santa-rosa.md'),
      descargar('cperez', 'politica-gastos-viaje.md'),
      subir('contrato-limpieza-serviclean.txt'),
      subir('politica-vacaciones.md'),
      subir('codigo-de-etica.md'),
      subir('procedimiento-onboarding.txt'),
      compartirCarpeta('/Recursos Humanos/Políticas', 'mgarcia', 'LECTURA'),
      compartirCarpeta('/Recursos Humanos/Políticas', 'jlopez', 'LECTURA'),
      descargar('mgarcia', 'politica-gastos-viaje.md'),
      subir('factura-F001-000231.txt'),
      subir('factura-F001-000231-duplicado.txt'),
      descargar('jlopez', 'politica-vacaciones.md'),
      subir('orden-servicio-papeleria-2026-04.txt'),
      compartirArchivo('presupuesto-anual-2026.md', 'admin', 'EDICION'),
      descargar('admin', 'presupuesto-anual-2026.md'),
      descargar('mgarcia', 'codigo-de-etica.md'),
      subir('inventario-equipos-oficina.txt'),
      crearCarpeta('/Borradores'),
      subir('borrador-contrato-arrendamiento.txt'),
      crearCarpeta('/Borradores/Antiguos'),
      subir('borrador-politica-privacidad-v1.md'),
      descargar('admin', 'politica-gastos-viaje.md'),
      subir('factura-F001-000232.txt'),
    ],
  },
  {
    mes: '2026-05',
    operaciones: [
      eliminarArchivo('factura-F001-000231-duplicado.txt'),
      eliminarDefinitivo('factura-F001-000231-duplicado.txt'),
      subir('acta-comite-legal-2026-05.txt', { nombreInicial: 'acta-comite-legal.txt' }),
      renombrar('acta-comite-legal-2026-05.txt'),
      subir('plan-capacitacion-2026.md'),
      compartirArchivo('plan-capacitacion-2026.md', 'jlopez', 'COMENTARIO'),
      // "2026" se crea por error directamente bajo /Contratos y luego se mueve
      // a /Contratos/Clientes con sus archivos dentro: obliga a recalcular
      // ancestros y ruta de todo el subarbol.
      crearCarpeta('/Contratos/Clientes/2026', '/Contratos'),
      subir('contrato-consultoria-agroexport-2026.md'),
      subir('acuerdo-confidencialidad-agroexport.txt'),
      descargar('jlopez', 'plan-capacitacion-2026.md'),
      moverCarpeta('/Contratos/Clientes/2026'),
      compartirCarpeta('/Contratos/Clientes', 'cperez', 'LECTURA'),
      compartirArchivo('contrato-consultoria-agroexport-2026.md', 'jlopez', 'EDICION'),
      descargar('jlopez', 'contrato-consultoria-agroexport-2026.md'),
      // cperez ya tiene LECTURA heredada de /Contratos/Clientes; el permiso
      // directo es mayor, asi que gana COMENTARIO.
      compartirArchivo('acuerdo-confidencialidad-agroexport.txt', 'cperez', 'COMENTARIO'),
      descargar('cperez', 'contrato-servicios-transportes-delsur.md'),
      crearCarpeta('/Proyectos'),
      subir('cartera-proyectos-2026.md'),
      crearCarpeta('/Proyectos/Implementación ERP'),
      subir('acta-constitucion-proyecto-erp.md'),
      compartirCarpeta('/Proyectos/Implementación ERP', 'jlopez', 'EDICION'),
      compartirCarpeta('/Proyectos/Implementación ERP', 'admin', 'COMENTARIO'),
      descargar('jlopez', 'acta-constitucion-proyecto-erp.md'),
      descargar('admin', 'acta-constitucion-proyecto-erp.md'),
    ],
  },
  {
    mes: '2026-06',
    operaciones: [
      subir('procedimiento-respaldo-informacion.md'),
      subir('acta-reunion-directorio-2026-06.md'),
      descargar('jlopez', 'acta-reunion-directorio-2026-06.md'),
      descargar('cperez', 'acta-reunion-directorio-2026-06.md'),
      subir('adenda-01-agroexport-2026.txt'),
      subir('factura-F001-000245.txt'),
      subir('contrato-auditoria-inmobiliaria-norte-2026.md'),
      compartirArchivo('contrato-auditoria-inmobiliaria-norte-2026.md', 'jlopez', 'COMENTARIO'),
      descargar('jlopez', 'contrato-auditoria-inmobiliaria-norte-2026.md'),
      subir('nota-credito-NC01-000018.txt'),
      subir('matriz-riesgos-erp.md'),
      compartirArchivo('matriz-riesgos-erp.md', 'mgarcia', 'LECTURA'),
      descargar('mgarcia', 'matriz-riesgos-erp.md'),
      subir('minuta-seguimiento-erp-01.txt'),
      subir('cronograma-erp.txt', { nombreInicial: 'cronograma-v2.txt' }),
      renombrar('cronograma-erp.txt'),
      // La matriz se compartio solo para una revision puntual.
      revocarArchivo('matriz-riesgos-erp.md', 'mgarcia'),
      descargar('jlopez', 'cronograma-erp.txt'),
      // Eliminada por error y restaurada el mismo mes.
      eliminarArchivo('politica-vacaciones.md'),
      restaurarArchivo('politica-vacaciones.md'),
    ],
  },
  {
    mes: '2026-07',
    operaciones: [
      subir('informe-flujo-caja-junio.md'),
      descargar('admin', 'informe-flujo-caja-junio.md'),
      crearCarpeta('/Proyectos/Implementación ERP/Entregables'),
      subir('especificacion-requisitos-erp.md'),
      compartirArchivo('especificacion-requisitos-erp.md', 'mgarcia', 'COMENTARIO'),
      descargar('jlopez', 'especificacion-requisitos-erp.md'),
      crearCarpeta('/Finanzas/Presupuestos/Q3'),
      subir('presupuesto-q3-area-legal.txt', { carpetaInicial: '/Finanzas/Presupuestos' }),
      moverArchivo('presupuesto-q3-area-legal.txt'),
      subir('presupuesto-q3-area-tecnologia.txt'),
      compartirCarpeta('/Finanzas/Presupuestos', 'mgarcia', 'LECTURA'),
      compartirCarpeta('/Finanzas/Presupuestos', 'cperez', 'COMENTARIO'),
      descargar('mgarcia', 'presupuesto-q3-area-legal.txt'),
      descargar('mgarcia', 'especificacion-requisitos-erp.md'),
      subir('minuta-seguimiento-erp-02.txt'),
      eliminarArchivo('orden-servicio-papeleria-2026-04.txt'),
      subir('notas-pendientes-legal.txt'),
    ],
  },
  {
    mes: '2026-08',
    operaciones: [
      subir('plan-pruebas-erp.md'),
      descargar('jlopez', 'plan-pruebas-erp.md'),
      descargar('admin', 'cronograma-erp.txt'),
      subir('registro-facturas-pendientes.md'),
      compartirArchivo('registro-facturas-pendientes.md', 'admin', 'COMENTARIO'),
      descargar('admin', 'registro-facturas-pendientes.md'),
      // Manda a la papelera la carpeta y, en cascada, Antiguos y sus 2 archivos.
      eliminarCarpeta('/Borradores'),
      subir('directorio-telefonico-interno.txt'),
      compartirArchivo('directorio-telefonico-interno.txt', 'mgarcia', 'LECTURA'),
      compartirArchivo('directorio-telefonico-interno.txt', 'jlopez', 'LECTURA'),
      compartirArchivo('directorio-telefonico-interno.txt', 'cperez', 'LECTURA'),
      descargar('mgarcia', 'directorio-telefonico-interno.txt'),
      descargar('cperez', 'manual-uso-sistema-documental.md'),
      eliminarArchivo('supuestos-presupuesto-2026.txt'),
    ],
  },
  {
    mes: '2026-09',
    operaciones: [
      subir('informe-avance-erp-septiembre.md'),
      descargar('jlopez', 'informe-avance-erp-septiembre.md'),
      descargar('admin', 'informe-avance-erp-septiembre.md'),
      subir('lista-tareas-semana.txt'),
      // cperez ya lee el manual por la carpeta compartida; ahora tambien lo
      // edita: el permiso directo EDICION gana sobre LECTURA heredada.
      compartirArchivo('manual-uso-sistema-documental.md', 'cperez', 'EDICION'),
      descargar('cperez', 'manual-uso-sistema-documental.md'),
      eliminarArchivo('minuta-seguimiento-erp-02.txt'),
      descargar('jlopez', 'contrato-consultoria-agroexport-2026.md'),
    ],
  },
  {
    mes: '2026-10',
    operaciones: [
      subir('informe-ejecucion-q3.md'),
      compartirArchivo('informe-ejecucion-q3.md', 'mgarcia', 'COMENTARIO'),
      descargar('mgarcia', 'informe-ejecucion-q3.md'),
      descargar('admin', 'informe-ejecucion-q3.md'),
      descargar('jlopez', 'plantilla-contrato-servicios.md'),
      descargar('admin', 'plantilla-contrato-servicios.md'),
      descargar('cperez', 'plantilla-contrato-servicios.md'),
      eliminarArchivo('lista-tareas-semana.txt'),
      descargar('admin', 'contrato-consultoria-agroexport-2026.md'),
    ],
  },
];
