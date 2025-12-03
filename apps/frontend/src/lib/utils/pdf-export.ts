/**
 * Utilitário para exportação de relatórios em PDF
 * Usa a funcionalidade de impressão do navegador para gerar PDF
 */

export interface PDFExportOptions {
    title: string
    content: string | HTMLElement
    filename?: string
}

export function exportToPDF(options: PDFExportOptions) {
    const { title, content, filename = 'report' } = options
    
    // Criar janela de impressão
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
        alert('Por favor, permita pop-ups para exportar PDF')
        return
    }

    const isElement = content instanceof HTMLElement
    const htmlContent = isElement ? content.outerHTML : content

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                @media print {
                    @page {
                        size: A4;
                        margin: 1cm;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12px;
                        color: #000;
                    }
                    h1 {
                        font-size: 24px;
                        margin-bottom: 20px;
                        color: #000;
                    }
                    h2 {
                        font-size: 18px;
                        margin-top: 20px;
                        margin-bottom: 10px;
                        color: #000;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 10px 0;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #f2f2f2;
                        font-weight: bold;
                    }
                    .no-print {
                        display: none;
                    }
                }
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
            ${htmlContent}
        </body>
        </html>
    `)

    printWindow.document.close()
    
    // Aguardar carregamento e abrir diálogo de impressão
    setTimeout(() => {
        printWindow.print()
    }, 250)
}

/**
 * Converte dados de tabela em HTML
 */
export function tableToHTML(data: any[], columns: Array<{ key: string; label: string }>): string {
    const headers = columns.map(col => `<th>${col.label}</th>`).join('')
    const rows = data.map(row => {
        const cells = columns.map(col => {
            const value = row[col.key]
            return `<td>${value !== null && value !== undefined ? String(value) : ''}</td>`
        }).join('')
        return `<tr>${cells}</tr>`
    }).join('')

    return `
        <table>
            <thead>
                <tr>${headers}</tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `
}

