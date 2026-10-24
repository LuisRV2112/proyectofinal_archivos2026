# Manual técnico — Sistema de Gestión Documental

Este documento explica cómo está construido el sistema, por qué se tomó cada
decisión de diseño, qué expone la API y cómo instalarlo y ejecutarlo desde
cero. El detalle de las colecciones está en
[`MODELO-DOCUMENTAL.md`](MODELO-DOCUMENTAL.md) y los diagramas UML en
[`diagramas/`](diagramas/).

---

## 1. Arquitectura

```
┌──────────────┐    HTTP/JSON     ┌──────────────────┐   Driver   ┌─────────────┐
│  Angular 21  │ ───────────────► │  Node.js         │ ─────────► │  MongoDB    │
│  (frontend)  │ ◄─────────────── │  Express         │ ◄───────── │             │
│  :4200       │    API REST      │  (backend) :3000 │            │  :27017     │
└──────────────┘                  └──────────────────┘            └─────────────┘
```

Son dos aplicaciones independientes, cada una con su propio `package.json`:

- **`frontend/`** — Angular 21. Es solo interfaz: consume la API REST y
  nunca toca la base de datos.
- **`backend/`** — Node.js con Express 5. Es el **único** que habla con
  MongoDB: valida la entrada, aplica las reglas de negocio y los permisos, y
  registra la actividad.

El diagrama de despliegue, con protocolos y puertos, está en
`diagramas/despliegue.drawio`.

### 1.1 Tecnologías

| Pieza | Elección | Por qué |
|---|---|---|
| Servidor | **Express 5** | El cliente es una aplicación Angular aparte. Una API REST pura es más simple que Next.js, que está pensado para renderizar en el servidor. Express 5 además propaga a sí solo los errores de los manejadores `async` |
| Acceso a datos | **Mongoose 9** | Esquemas explícitos, validación e índices declarativos: lo que hay que documentar y defender |
| Contenido | **GridFS** con el driver nativo (`GridFSBucket`) | Mongoose no integra GridFS, así que se usa `mongoose.connection.db` |
| Reportes | **Aggregation pipeline** nativo | Se escribe y se lee igual que en `mongosh` |
| Autenticación | **JWT** (`jsonwebtoken`) + **bcrypt** | La API no guarda sesiones: cada petición trae su token |
| Subida | **multer** en memoria | El contenido pasa de la memoria a GridFS sin tocar el disco del servidor |
| Frontend | **Angular 21** standalone, zoneless, con *signals* | Es la forma actual de Angular: no usa `NgModule` ni Zone.js, y el estado de cada pantalla vive en `signal`/`computed` |
| Vista previa de Markdown | **marked** | Convierte el `.md` a HTML en el navegador |

### 1.2 Backend por capas

```
backend/src/
├── app.js           Arranque: conecta a MongoDB y luego escucha en :3000
├── config/          Conexión a MongoDB (baseDatos.js) y bucket GridFS (gridfs.js)
├── modelos/         Esquemas de Mongoose e índices
├── middleware/      autenticacion.js (JWT y roles), subida.js (multer), errores.js
├── rutas/           Endpoints REST: solo leen la petición y llaman al servicio
├── servicios/       Lógica de negocio, permisos, papelera, reportes/
├── utilidades/      Validación de entrada, errores tipados, paginación, formato
└── seed/            Carga inicial (seed.js) y su verificación (verificarSeed.js)
```

La regla es **rutas → servicios → modelos**: una ruta nunca consulta MongoDB
directamente. Así la misma lógica se puede reutilizar, por ejemplo
`registrarActividad` lo usan todos los servicios. Además cada regla de negocio
vive en un solo lugar, que es donde el revisor la buscaría.

Flujo de una petición:

1. `cors` deja pasar solo al origen del frontend (`ORIGEN_FRONTEND`).
2. `express.json({ limit: '100kb' })` lee el cuerpo. El contenido de los
   archivos no pasa por aquí: llega como `multipart` por multer, con un límite
   de 5 MB.
3. `autenticar` verifica el JWT y **vuelve a leer al usuario de la base de
   datos**. Si lo desactivaron después de emitir el token, la petición se
   rechaza con 401 y su sesión abierta termina en su siguiente acción.
4. `exigirRol('ADMINISTRADOR')` protege lo que es solo del administrador.
5. El servicio valida la entrada (`utilidades/validacion.js`,
   `utilidades/consultas.js`), comprueba permisos (`servicios/permisos.js`),
   opera y registra la actividad.
6. Cualquier error termina en `middleware/errores.js`, que responde siempre con
   el mismo JSON:

```json
{ "estado": 409, "error": "Ya existe un elemento con ese nombre en la carpeta", "detalle": "...", "fecha": "2026-10-23T15:04:05.000Z" }
```

| Código | Cuándo |
|:-:|---|
| 400 | Entrada no válida: falta un campo, id mal formado, extensión distinta de `.txt`/`.md`, fecha inválida, mover una carpeta dentro de sí misma o de una descendiente |
| 401 | Sin token, token vencido o usuario desactivado |
| 403 | Autenticado pero sin permiso suficiente sobre el recurso o la ruta |
| 404 | El recurso no existe, o está en la papelera |
| 409 | Nombre repetido entre hermanos, username o correo ya usados, un administrador que intenta desactivarse a sí mismo |
| 413 | Archivo de más de 5 MB |
| 500 | Error no previsto (se registra en la consola; al cliente no se le envía la pila) |

### 1.3 Frontend

```
frontend/src/app/
├── nucleo/        Sesión (autenticacion.ts), interceptor del token, guards,
│                  avisos, modelos TypeScript, formato (bytes, fechas, acciones)
├── servicios/     Un servicio por recurso de la API (archivos, carpetas, …)
├── componentes/   Diálogos reutilizables: confirmación, nombre, compartir,
│                  selector de carpeta, vista previa
├── diseno/        Layout con el menú lateral, filtrado por rol
└── paginas/       Una carpeta por pantalla (explorador, buscar, compartidos,
                   papelera, reportes, actividad, usuarios, login)
```

- La URL de la API está en `nucleo/configuracion.ts` (`http://localhost:3000/api`).
- El **interceptor** agrega `Authorization: Bearer <token>` a cada petición.
  Si la API responde 401, cierra la sesión y lleva al login.
- Los **guards** `sesionGuard` y `administradorGuard` ocultan las pantallas que
  el rol no puede usar. Es solo una comodidad: la protección real la hace la API
  con 403, aunque alguien escriba la URL a mano.
- El token se guarda en `localStorage` para que la sesión sobreviva a recargar
  la página. Su vencimiento (`JWT_EXPIRACION`, 8 h por defecto) se comprueba
  también en el cliente.

---

## 2. Modelo de datos

Base de datos `gestion_documental`, con cuatro colecciones y el bucket GridFS:

| Colección | Qué guarda | Relación con las demás |
|---|---|---|
| `usuarios` | Cuentas, rol, estado, `almacenamientoUsado` y `cuotaAlmacenamiento` | Referenciado por `propietarioId`, `usuarioId` y `otorgadoPor` |
| `carpetas` | Árbol de carpetas por usuario | `padreId` + `ancestros`; embebe `compartidoCon` y `eliminado` |
| `archivos` | Metadatos de cada archivo | `carpetaId` + `ancestros`; `gridfsId` → `contenido.files`; embebe `compartidoCon` y `eliminado` |
| `actividad` | Historial de operaciones | `usuarioId` y `recursoId`; `recursoNombre` denormalizado |
| `contenido.files` / `contenido.chunks` | Bytes de cada archivo | GridFS, administrado por `GridFSBucket` |

Campos, documentos de ejemplo, justificación de cada embebido o referencia, e
índices: **[`MODELO-DOCUMENTAL.md`](MODELO-DOCUMENTAL.md)**. Diagrama de
relaciones: `diagramas/modelo-documental.drawio`.

---

## 3. Decisiones de diseño

### 3.1 Contenido en GridFS

El contenido de cada archivo va en GridFS (`contenido.files` y
`contenido.chunks`), nunca como una ruta a un archivo en el disco del
servidor. Hay tres razones:

1. **Separar metadatos y contenido.** Los listados, las búsquedas y los
   reportes leen `archivos` en cada petición. El contenido solo se lee al
   descargar o al abrir la vista previa. Con los bytes dentro del documento,
   cada listado arrastraría todo el contenido.
2. **Una sola fuente de verdad.** Con una ruta en disco, la base de datos y el
   sistema de archivos se pueden desincronizar: archivos huérfanos, o rutas que
   apuntan a nada. Además el respaldo de MongoDB no incluiría los archivos.
   Con GridFS, `mongodump` respalda todo junto.
3. **El límite de 16 MB del documento BSON**, que GridFS evita partiendo el
   contenido en *chunks* de 255 KB.

**Coherencia al subir** (`servicios/archivos.js → subirArchivo`, y
`diagramas/secuencia-subir-archivo.drawio`):

1. Se valida todo antes de escribir: la extensión, que el contenido sea texto
   UTF-8 válido, la carpeta destino (debe ser propia y no estar en la papelera)
   y que el nombre no se repita entre los hermanos.
2. Se **reserva el espacio** en la cuota del usuario con un `$inc` condicionado
   a que quepa (ver 3.5). Si no cabe, se responde 409 sin escribir nada.
3. Se escribe el contenido en GridFS y se obtiene su `_id`.
4. Se inserta el documento en `archivos` con ese `gridfsId`. **Si el insert
   falla, se borra el contenido recién escrito** y se devuelve la reserva,
   para que no quede contenido huérfano en GridFS ni espacio ocupado por nada.
5. Se registra `SUBIR` en el historial.

**Crear un archivo** escribiendo su contenido en la aplicación usa este mismo
camino: el frontend arma un archivo con el texto y lo envía al mismo endpoint
con `origen=editor`. Así crear y subir comparten todas las validaciones y la
cuota, y en el historial queda "Creado en el editor en /ruta" en lugar de
"Subido a /ruta".

La descarga (`GET /archivos/:id/descargar`) hace *streaming* desde GridFS
directo a la respuesta, sin cargar el archivo entero en memoria.

### 3.2 Herencia de permisos

Un usuario accede a un recurso por alguna de estas cuatro vías
(`servicios/permisos.js`):

1. Es su **propietario**.
2. Aparece en el `compartidoCon` del recurso (**permiso directo**).
3. Aparece en el `compartidoCon` de **alguna carpeta ancestro** (**herencia**).
4. Es **ADMINISTRADOR**, que tiene acceso de consulta (LECTURA) a todo.

Los permisos se heredan hacia abajo porque es lo que espera cualquier usuario
de un gestor documental: compartir una carpeta da acceso a todo su contenido,
incluido lo que se agregue después. Gracias a `ancestros`, la herencia se
resuelve con **una sola consulta**, sin recorrer el árbol hacia arriba:

```js
Carpeta.find({
  _id: { $in: recurso.ancestros },
  'compartidoCon.usuarioId': usuario._id,
  'eliminado.estado': false,
})
```

Si el usuario recibe el recurso por varias vías, **gana el nivel más alto**.
Ejemplo del seed: cperez tiene LECTURA heredada de `/Administracion/Manuales`
y EDICION directa en un archivo de esa carpeta, así que sobre ese archivo su
nivel es EDICION.

| Nivel | Qué permite |
|---|---|
| LECTURA | Ver metadatos y contenido, descargar, navegar dentro de la carpeta |
| COMENTARIO | Lo mismo que LECTURA. El nivel existe en el modelo y se respeta en el orden, pero el sistema todavía no tiene comentarios |
| EDICION | Además, renombrar |
| Propietario | Todo: crear dentro, mover, enviar a la papelera, compartir y revocar |

Mover, eliminar y compartir quedan reservados al propietario: reorganizan
**su** árbol y **su** espacio de almacenamiento, y decidir quién ve un recurso es
decisión de su dueño. El administrador también puede gestionar los permisos de
cualquier recurso.

El flujo completo, con la comprobación de la vía heredada, está en
`diagramas/secuencia-compartir-recurso.drawio`.

### 3.3 Papelera

`eliminado` es un subdocumento embebido (`estado`, `fecha`, `eliminadoPor`,
`padreOriginalId`): es una relación uno a uno con el recurso y nunca se consulta
por separado.

- **Enviar a la papelera no borra nada:** marca `eliminado.estado = true`. Todo
  listado y búsqueda filtra por `{"eliminado.estado": false}`, con índice.
- **En cascada:** eliminar una carpeta manda también todo su subárbol, carpetas
  y archivos, con un solo `updateMany({ ancestros: carpetaId })`. Los
  descendientes guardan la misma fecha que la carpeta, y así al restaurar la
  carpeta vuelven solo los que se fueron con ella, no los que ya estaban en la
  papelera.
- **Restaurar** devuelve el recurso a `padreOriginalId`. Si ese padre ya no
  existe o sigue en la papelera, el recurso va a la raíz del propietario y la
  respuesta trae un aviso. Si en el destino ya hay un hermano con el mismo
  nombre, se restaura con un sufijo numérico, por ejemplo `informe (2).md`, y
  la respuesta también lo avisa.
- **Eliminar definitivamente** borra el documento, su contenido en GridFS y
  descuenta los bytes de `almacenamientoUsado`. En una carpeta, hace lo mismo
  con todo su subárbol.
- **Enviar a la papelera no libera espacio**, igual que en cualquier gestor
  documental: el contenido sigue guardado y se puede restaurar.

### 3.4 Array of Ancestors

Cada carpeta y cada archivo guardan `ancestros`: los ids de todas las carpetas
desde la raíz. Con eso:

| Necesidad | Cómo se resuelve |
|---|---|
| Todo el subárbol (papelera en cascada, mover, búsqueda en subcarpetas) | `find({ ancestros: carpetaId })`, una consulta indexada |
| Migas de pan y herencia de permisos | Ya están en el documento, sin consulta |
| Evitar ciclos al mover A dentro de B | Se rechaza si `B` es `A` o si `A` está en `B.ancestros` |

**El costo:** al mover una carpeta hay que recalcular `ancestros` y `ruta` en
todo su subárbol (`servicios/arbol.js`). Se paga pocas veces, porque mover es
una operación rara comparada con listar. Las alternativas descartadas (solo
`padreId`, *materialized path*, `$graphLookup`) están en MODELO-DOCUMENTAL.md.

### 3.5 Denormalización del almacenamiento (*Computed Pattern*)

`usuarios.almacenamientoUsado` guarda la suma de los bytes del usuario. Se
actualiza con `$inc` al subir (+tamaño) y al eliminar definitivamente
(−tamaño). Sin este campo, mostrar el espacio usado o armar el reporte de
usuarios exigiría una agregación sobre `archivos` en cada consulta.

El riesgo de un dato denormalizado es que se desincronice. Por eso
`npm run seed:verificar` recalcula la suma desde `archivos` y la compara con el
campo de cada usuario.

**Almacenamiento asignado, usado y disponible.** Cada usuario tiene una
`cuotaAlmacenamiento` (bytes asignados) que fija el administrador al crearlo
o editarlo: 20 MB por defecto, hasta 10 GB. El **disponible** no se guarda: es
el virtual `almacenamientoDisponible = cuota − usado` del esquema, porque
guardarlo sería un segundo dato denormalizado que mantener al día.

La cuota se respeta aunque lleguen subidas simultáneas. En lugar de "leer el
usado, comparar y luego sumar", donde dos subidas verían espacio libre a la
vez, la comprobación y la suma son **una sola operación atómica**:

```js
Usuario.updateOne(
  { _id, $expr: { $lte: [{ $add: ['$almacenamientoUsado', bytes] }, '$cuotaAlmacenamiento'] } },
  { $inc: { almacenamientoUsado: bytes } }
)   // modifiedCount 0 → no cabe → 409
```

Bajar la cuota por debajo de lo que el usuario ya ocupa se rechaza con 409 y se
dice cuánto usa; la papelera cuenta, porque sigue ocupando espacio.

### 3.6 Otras decisiones

- **`recursoNombre` denormalizado en `actividad`:** si el recurso se elimina
  definitivamente, el historial sigue siendo legible.
- **El historial es una colección aparte** y no un arreglo dentro del usuario,
  porque crece sin límite y chocaría con los 16 MB del documento.
- **Desactivar un usuario no borra nada:** no puede iniciar sesión, pero sus
  documentos, permisos e historial se conservan y siguen contando en los
  reportes. Un administrador no puede desactivarse ni quitarse el rol a sí
  mismo, para que el sistema no se quede sin administradores.
- **Fechas en hora de Guatemala (UTC−6).** Un filtro `?desde=2026-05-01` cubre
  el día completo en hora local, y `$dateTrunc` agrupa con
  `timezone: 'America/Guatemala'`. Así un archivo subido a las 19:00 no
  aparece en el día siguiente.
- **Paginación con `$facet`:** el total y la página salen de una sola
  agregación. Los `$lookup` se hacen después de cortar la página, sobre 25 o
  50 filas y no sobre todo el resultado.

---

## 4. API REST

Base: `http://localhost:3000/api`. Todo excepto `/salud` y `/auth/login` exige
`Authorization: Bearer <token>`. En los cuerpos, los ids van como texto de 24
caracteres hexadecimales.

### 4.1 Autenticación y salud

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/salud` | público | Estado de la API y de MongoDB. Responde 503 si la base no contesta |
| POST | `/auth/login` | público | `{ username, password }` → `{ token, expiraEn, id, username, nombreCompleto, email, rol }`. Registra `LOGIN` o `LOGIN_FALLIDO` |
| GET | `/auth/yo` | cualquiera | El usuario del token, con su almacenamiento: `cuotaAlmacenamiento` (asignado), `almacenamientoUsado` y `almacenamientoDisponible` |

### 4.2 Usuarios (solo ADMINISTRADOR)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/usuarios?rol=&activo=` | Lista los usuarios con su almacenamiento asignado, usado y disponible. Nunca incluye `passwordHash` |
| POST | `/usuarios` | `{ username, email, nombreCompleto, password, rol, cuotaAlmacenamiento? }` (cuota en bytes; 20 MB si se omite). Responde 201, o 409 si el username o el correo ya existen |
| PATCH | `/usuarios/:id` | Cualquiera de `{ nombreCompleto, email, rol, password, cuotaAlmacenamiento }`. 409 si la cuota queda por debajo de lo usado |
| PATCH | `/usuarios/:id/estado` | `{ activo: true \| false }` |

### 4.3 Carpetas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/carpetas/raiz` | Carpetas y archivos de la raíz del usuario |
| GET | `/carpetas/:id` | La carpeta, sus migas de pan, sus subcarpetas y sus archivos. Exige LECTURA |
| POST | `/carpetas` | `{ nombre, padreId? }`. Solo dentro de carpetas propias |
| PATCH | `/carpetas/:id` | `{ nombre }`. Exige EDICION |
| PATCH | `/carpetas/:id/mover` | `{ padreId }` (`null` = raíz). Solo el propietario. 400 si crearía un ciclo |
| DELETE | `/carpetas/:id` | A la papelera, con todo su subárbol. Solo el propietario |

### 4.4 Archivos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/archivos` | Subir o crear. `multipart/form-data`: `archivo` (`.txt` o `.md`, hasta 5 MB), y opcionales `carpetaId`, `etiquetas` (hasta 10) y `origen` (`subida` \| `editor`). 409 si no cabe en la cuota |
| GET | `/archivos/buscar` | Filtros: `texto` (índice de texto sobre nombre y etiquetas), `extension`, `carpetaId`, `enSubarbol`, `desde`, `hasta`, `propietarioId`, `pagina`, `limite`. El usuario busca entre lo que puede leer; el administrador, entre todo |
| GET | `/archivos/:id` | Metadatos, con el nivel de acceso y por qué vía se tiene |
| GET | `/archivos/:id/descargar` | Descarga (*attachment*) en *streaming* desde GridFS. Registra `DESCARGAR` |
| GET | `/archivos/:id/contenido` | El texto, para la vista previa. No se registra como descarga |
| PATCH | `/archivos/:id` | `{ nombre }`, con la misma extensión. Exige EDICION |
| PATCH | `/archivos/:id/mover` | `{ carpetaId }` (`null` = raíz). Solo el propietario |
| DELETE | `/archivos/:id` | A la papelera. Solo el propietario |

### 4.5 Compartir

`:tipo` es `archivos` o `carpetas`: la misma lógica sirve para los dos porque
ambos embeben `compartidoCon` con el mismo esquema.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/recursos/:tipo/:id/compartir` | Permisos del recurso, con los usuarios poblados |
| POST | `/recursos/:tipo/:id/compartir` | `{ usuarioId, nivel }`. 201 si es nuevo; 200 si ya estaba y cambió el nivel |
| PATCH | `/recursos/:tipo/:id/compartir/:usuarioId` | `{ nivel }` |
| DELETE | `/recursos/:tipo/:id/compartir/:usuarioId` | Revocar |
| GET | `/compartidos/conmigo` | Lo compartido directamente con el usuario, con su nivel |
| GET | `/compartidos/por-mi` | Lo que el usuario compartió, con quién y con qué nivel |
| GET | `/compartidos/usuarios` | Usuarios activos a quienes se puede compartir (para el selector) |

### 4.6 Papelera

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/papelera` | Carpetas y archivos del usuario en la papelera, con su ubicación original |
| POST | `/papelera/:tipo/:id/restaurar` | Restaurar. Si vuelve a la raíz, la respuesta trae `avisos` explicando por qué |
| DELETE | `/papelera/:tipo/:id` | Eliminar definitivamente: borra el documento, el contenido en GridFS y descuenta el almacenamiento |

### 4.7 Historial

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/actividad` | Filtros: `usuarioId` (solo admin; un usuario normal siempre ve el suyo), `accion`, `recursoTipo`, `recursoId`, `desde`, `hasta`, `pagina`, `limite` |

Acciones registradas: `LOGIN`, `LOGIN_FALLIDO`, `CREAR_USUARIO`,
`MODIFICAR_USUARIO`, `ACTIVAR_USUARIO`, `DESACTIVAR_USUARIO`, `CREAR_CARPETA`,
`ELIMINAR_CARPETA`, `SUBIR`, `DESCARGAR`, `RENOMBRAR`, `MOVER`, `ELIMINAR`,
`RESTAURAR`, `ELIMINAR_DEFINITIVO`, `COMPARTIR`, `MODIFICAR_PERMISO` y `REVOCAR`.

### 4.8 Reportes

Los catorce se calculan con *aggregation pipeline*, con cada etapa comentada,
en `servicios/reportes/`. Del 1 al 12 son los de la sección de reportes del
proyecto; el 13 y el 14 los pide la hoja de calificación. Las fechas `desde` y `hasta` usan el formato
`AAAA-MM-DD`.

| # | Ruta (`/reportes/…`) | Rol | Parámetros |
|:-:|---|---|---|
| 1 | `archivos/por-tipo` | admin | `incluirPapelera` |
| 2 | `archivos/por-fecha` | admin | `desde` y/o `hasta` (obligatorio), `extension`, `incluirPapelera`, `pagina`, `limite` |
| 3 | `archivos/mas-operaciones` | admin | `desde`, `hasta`, `limite` |
| 4 | `usuarios/top-archivos` | admin | `incluirPapelera`, `limite` (10 por defecto) |
| 5 | `usuarios/mas-compartidos` | admin | `limite` |
| 6 | `comparticion/mas-compartidos` | cualquiera* | `tipo`, `limite` |
| 7 | `comparticion/compartidos-por` | cualquiera* | `usuarioId`, `tipo` |
| 8 | `comparticion/recibidos` | cualquiera* | `usuarioId`, `tipo` |
| 9 | `actividad/historial` | cualquiera* | `usuarioId`, `desde` y/o `hasta` (obligatorio), `accion`, `pagina`, `limite` |
| 10 | `actividad/por-tipo` | admin | `desde`, `hasta` |
| 11 | `actividad/por-periodo` | admin | `periodo` = `day` \| `week` \| `month` \| `year` (`$dateTrunc`), `desde`, `hasta` |
| 12 | `actividad/principales` | admin | `limite` (5 por defecto), `excluirSesion` |
| 13 | `comparticion/nunca-compartidos` | cualquiera* | `usuarioId`, `extension`, `pagina`, `limite` |
| 14 | `archivos/carpetas-mas-archivos` | admin | `contar` = `directos` \| `subarbol`, `usuarioId`, `limite` |

\* Un usuario normal solo puede consultarse a sí mismo: si envía el
`usuarioId` de otro recibe 403. Los reportes 6 y 13 le muestran solo sus
propios recursos.

Dos reportes que se apoyan en el modelo:

- **13 — Archivos que nunca han sido compartidos.** "Nunca" se responde con el
  **historial**, no con el estado actual: un archivo compartido y luego
  revocado tiene `compartidoCon` vacío, pero sí fue compartido. Y por la
  herencia, también cuenta si se compartió alguna carpeta que lo contiene.
  Gracias a `ancestros` basta **un** `$lookup` a `actividad`: ¿hay alguna
  entrada `COMPARTIR` cuyo `recursoId` sea el archivo o uno de sus ancestros?
- **14 — Carpetas con mayor cantidad de archivos.** Un `$lookup` de
  `carpetas._id` contra `archivos.ancestros` (índice `{ancestros: 1}`) trae los
  archivos de todo el subárbol, y en la misma pasada distingue los directos
  (`carpetaId` igual a la carpeta). `contar` elige por cuál se ordena.

Ejemplo:

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Documental2026!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s "localhost:3000/api/reportes/actividad/por-periodo?periodo=month" -H "Authorization: Bearer $TOKEN"
```

---

## 5. Instalación y ejecución

### 5.1 Requisitos

| Herramienta | Versión |
|---|---|
| Node.js | `^20.19.0`, `^22.12.0` o `^24.0.0` (lo exige Angular 21). Probado con 22.22 |
| npm | el que trae Node |
| MongoDB | 9.0, local en el puerto 27017, sin autenticación. Probado con 9.0.4 |
| mongosh | 2.x (opcional, para revisar la base) |

### 5.2 Backend

```bash
cd backend
npm install
cp .env.ejemplo .env      # y cambiar JWT_SECRETO por una cadena aleatoria
npm run seed              # borra y recrea la base gestion_documental
npm run seed:verificar    # debe terminar con "Todas las comprobaciones pasaron"
npm run dev               # API en http://localhost:3000/api
```

Variables de `.env` (plantilla en `.env.ejemplo`):

| Variable | Ejemplo | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto de la API |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/gestion_documental` | Conexión a MongoDB |
| `JWT_SECRETO` | cadena aleatoria larga | Firma de los tokens. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRACION` | `8h` | Duración de la sesión |
| `ORIGEN_FRONTEND` | `http://localhost:4200` | Único origen que CORS deja llamar a la API |

`npm start` ejecuta la API sin nodemon. Si MongoDB no está levantado, el
backend termina con un mensaje claro en lugar de aceptar peticiones que
fallarían.

### 5.3 Frontend

```bash
cd frontend
npm install
npx ng serve              # http://localhost:4200
```

Otros comandos: `npx ng build` (compila en `dist/`) y
`npx ng test --watch=false` (pruebas unitarias).

### 5.4 Carga inicial

`npm run seed` deja la base en un estado conocido y **consistente**:

| Elemento | Cantidad |
|---|---|
| Usuarios | 4: un administrador y tres usuarios |
| Carpetas | 18, hasta 3 niveles de profundidad |
| Archivos | 50 `.txt` y `.md`, cada uno con su contenido real en GridFS |
| Permisos compartidos | 29, con los tres niveles |
| Papelera | 4 archivos sueltos más 1 carpeta con su subárbol |
| Historial | ~300 entradas, una por cada operación simulada, en orden cronológico |

Los datos se generan aplicando las operaciones en orden, como si hubieran
ocurrido. `npm run seed:verificar` comprueba, contra la base real, que:

- `tamano` coincide con los bytes guardados en GridFS;
- `ancestros` y `ruta` son correctos respecto de `padreId`;
- `almacenamientoUsado` es la suma de los archivos de cada usuario y nadie
  supera su `cuotaAlmacenamiento`;
- toda carpeta en la papelera tiene su subárbol también en la papelera;
- el historial está en orden cronológico: nada ocurre antes de que exista el
  recurso o el usuario;
- los índices declarados existen.

Usuarios de prueba (contraseña de todos: **`Documental2026!`**):

| Usuario | Rol | Nombre |
|---|---|---|
| `admin` | ADMINISTRADOR | Andrés Salazar Medina |
| `mgarcia` | USUARIO | María Fernanda García Ruiz |
| `jlopez` | USUARIO | Jorge Luis López Torres |
| `cperez` | USUARIO | Carmen Pérez Vargas |

### 5.5 Revisar la base con mongosh

```js
use gestion_documental
db.archivos.getIndexes()
db.carpetas.find({ ancestros: ObjectId("...") })          // subárbol
db.getCollection("contenido.files").countDocuments()      // 50
db.usuarios.find({}, { passwordHash: 0 })
```

### 5.6 Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `MongooseServerSelectionError` al arrancar el backend | MongoDB no está corriendo: `sudo systemctl start mongod` |
| El frontend dice que no puede conectar con el servidor | El backend no está levantado en :3000 |
| Error de CORS en la consola del navegador | `ORIGEN_FRONTEND` no coincide con la URL del frontend |
| `ng serve` rechaza la versión de Node | Usar una versión de Node compatible con Angular 21 (ver 5.1) |
| Todas las peticiones devuelven 401 tras cambiar `JWT_SECRETO` | Los tokens anteriores ya no son válidos: cerrar sesión y volver a entrar |
