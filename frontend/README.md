# Frontend — Sistema de Gestión Documental

Aplicación Angular 21 (componentes standalone) que consume la API REST del
backend (`http://localhost:3000/api`). Nunca accede a MongoDB directamente.

## Ejecutar

```bash
cd frontend
npm ci            # instala exactamente las versiones de package-lock.json
npx ng serve      # http://localhost:4200
```

El backend debe estar encendido (`cd backend && npm start`).

> Con npm 10.9 un `npm install` sin `package-lock.json` falla con
> `Cannot read properties of null (reading 'edgesOut')` (error de npm al
> resolver dependencias *peer*). Con el lockfile del repositorio `npm ci`
> funciona; para regenerarlo se puede usar `npx npm@11 install`.

## Estructura de `src/app`

| Carpeta | Contenido |
|---|---|
| `nucleo/` | Sesión (JWT), interceptor HTTP, guards, avisos, errores y formato |
| `diseno/` | Layout con el menú lateral filtrado por rol |
| `paginas/` | Una carpeta por pantalla |

## Pruebas

```bash
npx ng test --watch=false
```
