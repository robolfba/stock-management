import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as path from 'path'
import {
    initDatabase,
    listProducts,
    listLowStockProducts,
    createProduct,
    updateProduct,
    softDeleteProduct,
    manageBackups,
    createSale,
    getUserByUsername,
    getSalesDataForExport
} from './database'
import type { User } from '../shared/types'
const bcrypt = require('bcryptjs')

import { logger } from './logger'
const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
let currentUser: User | null = null

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../../../assets/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    })

    if (isDev) {
        // In dev mode, load from the Vite dev server
        win.loadURL('http://localhost:5173')
        win.webContents.openDevTools()
    } else {
        // In production, load built renderer files
        win.loadFile(path.join(__dirname, '../../renderer/index.html'))
    }
}

app.whenReady().then(() => {
    // Inicializar base de datos
    try {
        console.log('Inicializando base de datos...')
        initDatabase()

        // Ejecutar rutina de backups en segundo plano (sin await para no bloquear arranque)
        manageBackups()
    } catch (error: any) {
        logger.error(`Error inicializando base de datos: ${error.message}`)
        console.error('Error inicializando base de datos:', error)
    }

    // IPC Handlers
    ipcMain.handle('app:get-version', () => app.getVersion())
    ipcMain.handle('app:list-products', () => listProducts())
    ipcMain.handle('app:list-low-stock', () => listLowStockProducts())
    ipcMain.handle('app:create-product', (_, prod) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para crear productos')
        }
        return createProduct(prod)
    })
    ipcMain.handle('app:update-product', (_, id, changes) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para editar productos')
        }
        return updateProduct(id, changes)
    })
    ipcMain.handle('app:create-sale', (_, saleData) => createSale(saleData))

    ipcMain.handle('app:generate-backup', async () => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para generar backups')
        }
        const { performManualBackup } = require('./database')
        return performManualBackup()
    })

    ipcMain.handle('app:list-backups', async () => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para listar backups')
        }
        const { listAvailableBackups } = require('./database')
        return listAvailableBackups()
    })

    ipcMain.handle('app:restore-backup', async (_, fileName) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para restaurar backups')
        }
        const { restoreFromBackup } = require('./database')

        // Ejecución síncrona de la restauración segura
        restoreFromBackup(fileName)

        // Reinicio obligatorio de la aplicación tras sobreescribir el archivo .db
        app.relaunch()
        app.exit(0)
    })

    // Auth Handlers
    ipcMain.handle('app:login', async (_, username, password) => {
        const userRow = getUserByUsername(username)
        if (!userRow) {
            logger.error(`Intento de login fallido: Usuario no encontrado (${username})`)
            throw new Error('Usuario o contraseña incorrectos')
        }

        const match = await bcrypt.compare(password, userRow.passwordHash)
        if (!match) {
            logger.error(`Intento de login fallido: Contraseña incorrecta para ${username}`)
            throw new Error('Usuario o contraseña incorrectos')
        }

        currentUser = {
            id: userRow.id,
            username: userRow.username,
            role: userRow.role as 'admin' | 'vendedor'
        }
        return currentUser
    })

    ipcMain.handle('app:logout', () => {
        currentUser = null
    })

    ipcMain.handle('app:get-current-user', () => {
        return currentUser
    })

    // Protección de acciones por rol
    ipcMain.handle('app:soft-delete', (_, id) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para eliminar productos')
        }
        return softDeleteProduct(id)
    })

    ipcMain.handle('app:list-deleted-products', () => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para ver productos eliminados')
        }
        const { listDeletedProducts } = require('./database')
        return listDeletedProducts()
    })

    ipcMain.handle('app:hard-delete-product', (_, id) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para eliminar productos definitivamente')
        }
        const { hardDeleteProduct } = require('./database')
        return hardDeleteProduct(id)
    })

    ipcMain.handle('app:export-sales-csv', async (_, startDate, endDate) => {
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('No tenés permisos para exportar datos')
        }

        const data = getSalesDataForExport(startDate, endDate)
        if (data.length === 0) {
            throw new Error('No hay ventas en el rango de fechas seleccionado')
        }

        // Construir CSV
        // BOM para Excel (\ufeff)
        let csvContent = '\ufeff'
        const headers = ['fecha_venta', 'cliente', 'producto_nombre', 'cantidad', 'precio_unitario', 'total']
        csvContent += headers.join(';') + '\n'

        for (const row of data) {
            const line = [
                row.fecha_venta,
                'Mostrador', // Cliente por defecto
                row.producto_nombre,
                row.cantidad,
                row.precio_unitario,
                row.total
            ]
            csvContent += line.join(';') + '\n'
        }

        const { filePath } = await dialog.showSaveDialog({
            title: 'Exportar Ventas',
            defaultPath: path.join(app.getPath('documents'), `ventas_${startDate}_${endDate}.csv`),
            filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        })

        if (filePath) {
            const fs = require('fs')
            fs.writeFileSync(filePath, csvContent, 'utf-8')
            return { success: true, filePath }
        }

        return { success: false }
    })


    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
