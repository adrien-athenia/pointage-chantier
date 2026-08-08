import type { ReactNode } from 'react'

export interface ResponsiveTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
}

export function ResponsiveTable<T>({ columns, rows, getRowKey }: ResponsiveTableProps<T>) {
  return (
    <div className="rtable-wrap">
      <table className="rtable">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.header}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
