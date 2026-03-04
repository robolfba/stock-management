# Stock Management — Electron + Vite + React + TypeScript

Infraestructura base lista para build. Sin base de datos ni lógica de negocio.

## Estructura del proyecto

```
stock-management/
├── assets/
│   ├── icon.png          ← ícono fuente
│   └── icon.ico          ← ícono generado para Windows
├── scripts/
│   └── dev.js            ← launcher de desarrollo (cross-platform)
├── src/
│   ├── main/             ← Proceso principal Electron (Node.js, CommonJS)
│   │   └── index.ts
│   ├── preload/          ← Script preload con contextBridge
│   │   └── preload.ts
│   ├── renderer/         ← React + Vite (browser)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   └── shared/           ← Tipos compartidos (main ↔ renderer)
│       └── types.ts
├── tsconfig.json         ← TypeScript para el renderer (Vite)
├── tsconfig.main.json    ← TypeScript para main + preload (CommonJS)
├── vite.config.ts
├── .eslintrc.cjs
└── .prettierrc
```

## Seguridad

- `contextIsolation: true`
- `nodeIntegration: false`
- API expuesta al renderer **solo** vía `contextBridge` en `preload.ts`
- `window.electronAPI` tipado en `src/shared/types.ts`
- Detección dev/prod con `app.isPackaged` (no requiere `.env`)

## Comandos

### 0. Instalar dependencias (solo la primera vez)

```bash
npm install
```

### 1. Modo desarrollo

```bash
npm run dev
```

Compila el main process, inicia Vite en `http://localhost:5173` y lanza Electron.
La app aparece en una **ventana nativa de Electron** (no en el navegador).
Para ver solo el renderer, abrí `http://localhost:5173` mientras dev está corriendo.

### 2. Generar instalador Windows

```bash
npm run dist
```

Flujo:
1. Vite compila el renderer → `dist/renderer/`
2. tsc compila main + preload → `dist/main/`
3. electron-builder genera el instalador NSIS → `release/Stock Management Setup 1.0.0.exe`

El instalador NSIS permite elegir directorio, crear accesos directos en escritorio y menú de inicio.

> **Primera vez:** si falla con "Cannot create symbolic link", activá
> **Modo de desarrollador** en *Configuración → Sistema → Para desarrolladores*
> y volvé a correr `npm run dist`.

### 3. Iterar y actualizar

`npm run dist` **sobreescribe** el `.exe` anterior automáticamente.
No hace falta borrar ni desinstalar antes de generar una nueva versión.

Flujo recomendado para actualizar:
```
1. Cerrar la app instalada (si está abierta)
2. npm run dist
3. Ejecutar el nuevo .exe — el instalador NSIS actualiza la instalación existente
```

### 4. Desinstalar

> **Inicio → Configuración → Aplicaciones → "Stock Management" → Desinstalar**

O desde el directorio de instalación: `Uninstall Stock Management.exe`

## Scripts disponibles

| Script | Acción |
|---|---|
| `npm run dev` | Desarrollo con hot-reload |
| `npm run build` | Compila renderer + main a `dist/` |
| `npm run dist` | Build completo + instalador `.exe` en `release/` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run version:patch` | Sube la versión Z (x.y.Z) para corrección de bugs |
| `npm run version:minor` | Sube la versión Y (x.Y.0) para nuevas funcionalidades |

## Versionado y Release

El proyecto utiliza [Semantic Versioning](https://semver.org/) (`vMAJOR.MINOR.PATCH`).
La versión actual está centralizada en el `package.json`. `electron-builder` la lee automáticamente para generar el instalador con el número de versión correcto (ej: `Stock Management Setup 0.1.0.exe`).

### Proceso de Release

1. **Desarrollar y probar** los cambios.
2. **Actualizar el `CHANGELOG.md`** moviendo los cambios desde una sección `[Unreleased]` a la nueva versión, indicando la fecha.
3. **Subir la versión** ejecutando uno de los scripts (esto actualiza el `package.json` y si usas git, crea un commit y un tag):
   ```bash
   # Para arreglos de bugs (ej: 0.1.0 -> 0.1.1)
   npm run version:patch

   # Para nuevas funcionalidades (ej: 0.1.1 -> 0.2.0)
   npm run version:minor
   ```
4. **Generar el instalador** con la nueva versión:
   ```bash
   npm run dist
   ```
   El instalador resultante en la carpeta `release/` tendrá el nuevo número de versión.

## Sistema de Migraciones (SQLite)

La aplicación gestiona automáticamente los cambios en la estructura de la base de datos sin borrar datos existentes.

### ¿Cuándo necesitas una migración?

- **Agregar una columna**: Ej: "Necesito guardar el precio de costo en la tabla Producto".
- **Crear una tabla**: Ej: "Quiero agregar un sistema de Proveedores".
- **Cambiar valores por defecto**: Ej: "Ahora el stock mínimo inicial debe ser 5".
- **Limpieza de datos**: Ej: "Quiero pasar todos los nombres de productos a MAYÚSCULAS una sola vez".

### Cómo realizar una migración (Paso a paso)

Todas las migraciones se definen en `src/main/database.ts`.

1.  **Abrir `src/main/database.ts`** y localizar el array `migrations`.
2.  **Agregar el nuevo objeto de migración** al final del array:
    ```typescript
    {
      version: 2, // Incrementar siempre el número
      description: 'Agrega columna precioCosto a Producto',
      up: (db) => {
        // Usar try/catch para columnas ya que SQLite no tiene "IF NOT EXISTS" para ALTER TABLE
        try { 
          db.exec('ALTER TABLE Producto ADD COLUMN precioCosto REAL DEFAULT 0');
        } catch (e) {
          console.log('La columna ya existe o hubo un error manejado.');
        }
      }
    }
    ```
3.  **Actualizar la constante `REQUIRED_SCHEMA_VERSION`**:
    ```typescript
    const REQUIRED_SCHEMA_VERSION = 2; // Debe coincidir con la última versión del array
    ```

El sistema detectará que la versión en la base de datos es menor a la requerida y aplicará los cambios automáticamente al iniciar la aplicación.

## Troubleshooting & Debugging

Si encontrás errores inesperados o querés ver qué está pasando "bajo el capó":

### 1. Ubicación de Archivos Críticos
En Windows, todos los datos persistentes se guardan en:
`%APPDATA%\stock-management\`

- **Logs de Errores**: `\logs\app-YYYY-MM-DD.log`
- **Base de Datos**: `\stock.db` (podés abrirlo con DB Browser for SQLite)
- **Backups**: `\backups\` (últimos 7 estados saludables)

### 2. Consola de Desarrollador
- **En Desarrollo (`npm run dev`)**: La ventana de Chrome DevTools se abre automáticamente.
- **En Producción (Instalado)**: Las herramientas de desarrollo están deshabilitadas por seguridad. Revisá los archivos de log mencionados arriba.

### 3. Errores Comunes
- **"Usuario o contraseña incorrectos"**: Revisá el archivo de log para ver si es un error de credenciales o un fallo de conexión con la DB.
- **Fallo en Ventas**: Si una venta falla, el log indicará qué producto causó el error de stock insuficiente.
- **Reconstrucción de dependencias nativas**: Si `better-sqlite3` falla tras actualizar Node, ejecutá:
  ```bash
  npm run postinstall
  ```
