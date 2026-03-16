import { useState, useCallback, useEffect, useRef } from 'react'
import { logger } from '@dios/shared'
import { useAuth } from '../contexts/AuthContext'
import { useDatabase } from './useDatabase'
import {
  getOrCreateMasterSheet,
  buildRowFromInspection,
  buildRowFromOperation,
  buildRowFromExpense,
  syncInspectionRow,
  fullSync,
  fullSyncOperators,
  fullSyncExpenses,
} from '../lib/sheetsSync'
import { queueSheetWrite } from '../lib/sheetsSyncQueue'

function parseYear(dateStr: string | undefined): number {
  if (dateStr) {
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) return parsed.getFullYear()
  }
  return new Date().getFullYear()
}

export function useSheetsSync() {
  const { user, googleAccessToken, isLocalUser } = useAuth()
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncError, setLastSyncError] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState<string | null>(null)

  const inspectionsDb = useDatabase<any>({ table: 'inspections' })
  const operationsDb = useDatabase<any>({ table: 'operations' })
  const agenciesDb = useDatabase<any>({ table: 'agencies' })
  const invoicesDb = useDatabase<any>({ table: 'invoices' })
  const expensesDb = useDatabase<any>({ table: 'expenses' })

  const syncInspection = useCallback(async (inspectionId: string): Promise<void> => {
    if (!user || isLocalUser || !googleAccessToken) return

    setIsSyncing(true)
    setLastSyncError(null)

    try {
      const inspection = await inspectionsDb.findById(inspectionId)
      if (!inspection) return

      const year = parseYear(inspection.date)
      const spreadsheetId = await getOrCreateMasterSheet(year, user.uid)

      const operation = inspection.operationId
        ? await operationsDb.findById(inspection.operationId)
        : null

      const agency = operation?.agencyId
        ? await agenciesDb.findById(operation.agencyId)
        : null

      const allInvoices = await invoicesDb.findAll()
      const invoice = allInvoices.find((inv: any) => inv.inspectionId === inspectionId) ?? null

      const allExpenses = await expensesDb.findAll()
      const expenses = allExpenses.filter((e: any) => e.inspectionId === inspectionId)

      const rowData = buildRowFromInspection({ inspection, operation, agency, invoice, expenses })

      try {
        await syncInspectionRow(spreadsheetId, inspectionId, rowData)
      } catch (syncErr) {
        logger.error('Sheet row sync failed, queueing for retry:', syncErr)
        await queueSheetWrite(inspectionId, rowData, spreadsheetId)
      }

      setSheetUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('syncInspection failed:', error)
      setLastSyncError(message)
    } finally {
      setIsSyncing(false)
    }
  }, [user, isLocalUser, googleAccessToken, inspectionsDb, operationsDb, agenciesDb, invoicesDb, expensesDb])

  const syncAllInspections = useCallback(async (): Promise<void> => {
    if (!user || isLocalUser || !googleAccessToken) return

    setIsSyncing(true)
    setLastSyncError(null)

    try {
      const [allInspections, allOperations, allAgencies, allInvoices, allExpenses] =
        await Promise.all([
          inspectionsDb.findAll(),
          operationsDb.findAll(),
          agenciesDb.findAll(),
          invoicesDb.findAll(),
          expensesDb.findAll(),
        ])

      const operationsById = new Map(allOperations.map((o: any) => [o.id, o]))
      const agenciesById = new Map(allAgencies.map((a: any) => [a.id, a]))

      const byYear = new Map<number, any[]>()
      for (const inspection of allInspections) {
        const year = parseYear(inspection.date)
        const group = byYear.get(year) ?? []
        group.push(inspection)
        byYear.set(year, group)
      }

      const currentYear = new Date().getFullYear()

      for (const [year, inspections] of byYear) {
        const spreadsheetId = await getOrCreateMasterSheet(year, user.uid)

        const rows = inspections.map((inspection: any) => {
          const operation = operationsById.get(inspection.operationId) ?? null
          const agency = operation ? agenciesById.get(operation.agencyId) ?? null : null
          const invoice = allInvoices.find((inv: any) => inv.inspectionId === inspection.id) ?? null
          const expenses = allExpenses.filter((e: any) => e.inspectionId === inspection.id)
          return buildRowFromInspection({ inspection, operation, agency, invoice, expenses })
        })

        await fullSync(spreadsheetId, rows)

        // Sync Operators and Expenses tabs (full replace, same spreadsheet)
        if (year === currentYear) {
          const operatorRows = allOperations.map((operation: any) => {
            const agency = agenciesById.get(operation.agencyId) ?? null
            return buildRowFromOperation({ operation, agency })
          })
          await fullSyncOperators(spreadsheetId, operatorRows)

          const expenseRows = allExpenses.map((expense: any) => buildRowFromExpense(expense))
          await fullSyncExpenses(spreadsheetId, expenseRows)

          setSheetUrl(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('syncAllInspections failed:', error)
      setLastSyncError(message)
    } finally {
      setIsSyncing(false)
    }
  }, [user, isLocalUser, googleAccessToken, inspectionsDb, operationsDb, agenciesDb, invoicesDb, expensesDb])

  // Auto-sync: run a full sync on first sign-in, then every 5 minutes
  const hasSynced = useRef(false)

  useEffect(() => {
    if (!user || isLocalUser || !googleAccessToken) {
      hasSynced.current = false
      return
    }

    // Initial sync on sign-in
    if (!hasSynced.current) {
      hasSynced.current = true
      syncAllInspections()
    }

    // Periodic background sync every 5 minutes
    const interval = setInterval(() => {
      syncAllInspections()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [user, isLocalUser, googleAccessToken, syncAllInspections])

  return { syncInspection, syncAllInspections, isSyncing, lastSyncError, sheetUrl }
}
