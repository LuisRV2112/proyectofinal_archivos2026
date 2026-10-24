# Sistema de Gestión Documental

Proyecto final del curso de Archivos (2026). Es un sistema web para almacenar,
organizar, consultar y compartir documentos `.txt` y `.md` entre los usuarios
de una organización. Incluye:

- carpetas jerárquicas;
- permisos que se heredan hacia abajo;
- papelera con restauración;
- historial de actividad;
- doce reportes con *aggregation pipeline*.

| Capa | Tecnología | Puerto |
|---|---|---|
| Frontend | Angular 21 | 4200 |
| Backend | Node.js + Express 5 (API REST) | 3000 |
| Base de datos | MongoDB 9, con el contenido de los archivos en GridFS | 27017 |

El frontend solo consume la API; el backend es el único que habla con MongoDB.

## Requisitos

- **Node.js** `^20.19.0`, `^22.12.0` o `^24.0.0` (lo exige Angular 21)
- **MongoDB 9.0** corriendo en `localhost:27017`, sin autenticación
- **mongosh** 2.x (opcional)

## Cómo levantarlo

**1. Backend**, en una terminal:

```bash
cd backend
npm install
cp .env.ejemplo .env      # obligatorio; conviene cambiar JWT_SECRETO por una cadena aleatoria
npm run seed              # crea la base gestion_documental con los datos de prueba
npm run seed:verificar    # debe terminar con "Todas las comprobaciones pasaron"
npm run dev               # http://localhost:3000/api
```

**2. Frontend**, en otra terminal:

```bash
cd frontend
npm install
npx ng serve              # http://localhost:4200
```

Abre **http://localhost:4200** y entra con uno de los usuarios de prueba.

`npm run seed` borra y recrea la base, así que se puede ejecutar de nuevo para
volver al estado inicial.

## Usuarios de prueba

Contraseña de todos: **`Documental2026!`**

| Usuario | Rol | Nombre |
|---|---|---|
| `admin` | Administrador | Andrés Salazar Medina |
| `mgarcia` | Usuario | María Fernanda García Ruiz |
| `jlopez` | Usuario | Jorge Luis López Torres |
| `cperez` | Usuario | Carmen Pérez Vargas |

La carga inicial incluye:

- 18 carpetas, de hasta 3 niveles;
- 50 archivos con su contenido en GridFS;
- 29 permisos compartidos, con los tres niveles;
- 4 archivos y 1 carpeta, con su contenido, en la papelera;
- unas 300 entradas de historial.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/MODELO-DOCUMENTAL.md`](docs/MODELO-DOCUMENTAL.md) | Colecciones, embebido vs. referencia y por qué, Array of Ancestors, GridFS e índices |
| [`docs/MANUAL-TECNICO.md`](docs/MANUAL-TECNICO.md) | Arquitectura, decisiones de diseño, endpoints de la API, instalación |
| [`docs/MANUAL-USUARIO.md`](docs/MANUAL-USUARIO.md) | Cada pantalla, por rol |
| [`docs/diagramas/`](docs/diagramas/) | Casos de uso, secuencia (subir y compartir), despliegue y modelo, en formato `.drawio` |

## Estructura

```
backend/    API REST: config, modelos, middleware, servicios, rutas, seed
frontend/   Aplicación Angular
docs/       Modelo documental, manuales y diagramas
```
