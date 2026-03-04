import { app, BrowserWindow, ipcMain } from 'electron'
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
    getUserByUsername
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
