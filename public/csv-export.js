// CSV Export Module for Amazon Tracker
// Provides client-side CSV export with column selection

(function() {
    'use strict';

    // Column definitions for each page
    const COLUMN_DEFINITIONS = {
        dashboard: [
            { id: 'asin', label: 'ASIN', default: true },
            { id: 'title', label: 'Product Title', default: true },
            { id: 'availability', label: 'Stock Status', default: true },
            { id: 'stock_level', label: 'Stock Level', default: false },
            { id: 'seller', label: 'Seller', default: true },
            { id: 'price', label: 'Price', default: true },
            { id: 'price_change', label: 'Price Change', default: false },
            { id: 'sales_shipped', label: 'Sales Shipped', default: true },
            { id: 'sales_revenue', label: 'Sales Revenue', default: true },
            { id: 'traffic_views', label: 'Traffic Views', default: false },
            { id: 'received_qty', label: 'Received Qty', default: false },
            { id: 'inbound_qty', label: 'Inbound Qty', default: false },
            { id: 'last_po_date', label: 'Last PO Date', default: true },
            { id: 'check_date', label: 'Last Check', default: false }
        ],
        purchaseOrders: [
            { id: 'po_number', label: 'PO Number', default: true },
            { id: 'vendor_code', label: 'Vendor Code', default: true },
            { id: 'po_date', label: 'PO Date', default: true },
            { id: 'status', label: 'Status', default: true },
            { id: 'delivery_window_start', label: 'Delivery Start', default: true },
            { id: 'delivery_window_end', label: 'Delivery End', default: true },
            { id: 'items_count', label: 'Items Count', default: true },
            { id: 'ship_to_id', label: 'Ship To ID', default: true },
            { id: 'ship_to_city', label: 'Ship To City', default: false }
        ],
        vendorAnalytics: [
            { id: 'asin', label: 'ASIN', default: true },
            { id: 'title', label: 'Product Title', default: true },
            { id: 'sku', label: 'SKU', default: false },
            { id: 'availability', label: 'Availability', default: true },
            { id: 'price', label: 'Price', default: true },
            { id: 'rt_inv_available', label: 'RT Inventory', default: true },
            { id: 'rt_sales_shipped', label: 'RT Sales Shipped', default: false },
            { id: 'rt_sales_revenue', label: 'RT Sales Revenue', default: false },
            { id: 'sales_shipped', label: 'Weekly Shipped', default: true },
            { id: 'sales_ordered', label: 'Weekly Ordered', default: false },
            { id: 'sales_revenue', label: 'Weekly Revenue', default: true },
            { id: 'traffic_views', label: 'Traffic Views', default: true },
            { id: 'inventory_sellable', label: 'Sellable Inventory', default: false },
            { id: 'last_po_date', label: 'Last PO Date', default: true },
            { id: 'po_count', label: 'PO Count', default: false },
            { id: 'total_ordered', label: 'Total Ordered', default: false },
            { id: 'total_received', label: 'Total Received', default: false }
        ]
    };

    // Escape CSV special characters
    function escapeCSV(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    // Extract data from dashboard table
    function extractDashboardData(columns) {
        const rows = document.querySelectorAll('.inventory-row:not(.hidden-row)');
        const data = [];

        rows.forEach(row => {
            const rowData = {};

            if (columns.includes('asin')) {
                const asinLink = row.querySelector('td:nth-child(4) .font-mono');
                rowData.asin = asinLink ? asinLink.textContent.trim() : '';
            }
            if (columns.includes('title')) {
                const titleDiv = row.querySelector('td:nth-child(5)');
                rowData.title = titleDiv ? titleDiv.textContent.trim().substring(0, 100) : '';
            }
            if (columns.includes('availability')) {
                const statusCell = row.querySelector('.stock-cell');
                if (statusCell) {
                    const stockText = statusCell.querySelector('.text-emerald-600, .text-red-600, .text-amber-600');
                    rowData.availability = stockText ? stockText.textContent.trim() : '';
                }
            }
            if (columns.includes('stock_level')) {
                const levelBadge = row.querySelector('.stock-cell .bg-yellow-100, .stock-cell .bg-red-100');
                rowData.stock_level = levelBadge ? levelBadge.textContent.trim() : '';
            }
            if (columns.includes('seller')) {
                const sellerCell = row.querySelector('td:nth-child(7)');
                rowData.seller = sellerCell ? sellerCell.textContent.trim() : '';
            }
            if (columns.includes('price')) {
                const priceCell = row.querySelector('td:nth-child(8) .font-black');
                rowData.price = priceCell ? priceCell.textContent.trim() : '';
            }
            if (columns.includes('price_change')) {
                const changeDiv = row.querySelector('td:nth-child(8) .text-red-500, td:nth-child(8) .text-emerald-500');
                rowData.price_change = changeDiv ? changeDiv.textContent.trim() : '';
            }
            if (columns.includes('sales_shipped')) {
                const salesCell = row.querySelector('td:nth-child(9) .font-bold');
                rowData.sales_shipped = salesCell ? salesCell.textContent.trim() : '';
            }
            if (columns.includes('sales_revenue')) {
                const revenueDiv = row.querySelector('td:nth-child(9) .text-slate-500');
                rowData.sales_revenue = revenueDiv ? revenueDiv.textContent.trim() : '';
            }
            if (columns.includes('traffic_views')) {
                const trafficCell = row.querySelector('td:nth-child(10) .font-bold');
                rowData.traffic_views = trafficCell ? trafficCell.textContent.trim() : '';
            }
            if (columns.includes('received_qty')) {
                const receivedCell = row.querySelector('td:nth-child(11) .font-bold');
                rowData.received_qty = receivedCell ? receivedCell.textContent.trim() : '';
            }
            if (columns.includes('inbound_qty')) {
                const inboundBadge = row.querySelector('td:nth-child(11) .bg-orange-100');
                rowData.inbound_qty = inboundBadge ? inboundBadge.textContent.replace(/[^0-9]/g, '') : '';
            }
            if (columns.includes('last_po_date')) {
                const poDateCell = row.querySelector('td:nth-child(12) .font-bold');
                rowData.last_po_date = poDateCell ? poDateCell.textContent.trim() : '';
            }
            if (columns.includes('check_date')) {
                rowData.check_date = row.getAttribute('data-check-date') || '';
            }

            data.push(rowData);
        });

        return data;
    }

    // Extract data from purchase orders table
    function extractPurchaseOrdersData(columns) {
        const rows = document.querySelectorAll('tr[id^="po-row-"]');
        const data = [];

        rows.forEach(row => {
            const rowData = {};

            if (columns.includes('po_number')) {
                const poCell = row.querySelector('td:nth-child(1) .font-mono');
                rowData.po_number = poCell ? poCell.textContent.trim() : '';
            }
            if (columns.includes('vendor_code')) {
                const vendorCell = row.querySelector('td:nth-child(2) .font-mono');
                rowData.vendor_code = vendorCell ? vendorCell.textContent.trim() : '';
            }
            if (columns.includes('po_date')) {
                const dateCell = row.querySelector('td:nth-child(3)');
                rowData.po_date = dateCell ? dateCell.textContent.trim() : '';
            }
            if (columns.includes('status')) {
                const statusCell = row.querySelector('.status-badge');
                rowData.status = statusCell ? statusCell.textContent.trim() : '';
            }
            if (columns.includes('delivery_window_start') || columns.includes('delivery_window_end')) {
                const windowCell = row.querySelector('td:nth-child(5)');
                if (windowCell) {
                    const dates = windowCell.textContent.trim().split('to');
                    if (columns.includes('delivery_window_start')) {
                        rowData.delivery_window_start = dates[0] ? dates[0].trim() : '';
                    }
                    if (columns.includes('delivery_window_end')) {
                        rowData.delivery_window_end = dates[1] ? dates[1].trim() : '';
                    }
                }
            }
            if (columns.includes('items_count')) {
                const itemsCell = row.querySelector('td:nth-child(6) .font-bold');
                rowData.items_count = itemsCell ? itemsCell.textContent.trim() : '';
            }
            if (columns.includes('ship_to_id')) {
                const shipToCell = row.querySelector('td:nth-child(7) .font-mono');
                rowData.ship_to_id = shipToCell ? shipToCell.textContent.trim() : '';
            }
            if (columns.includes('ship_to_city')) {
                const shipToCell = row.querySelector('td:nth-child(7) .text-slate-500');
                rowData.ship_to_city = shipToCell ? shipToCell.textContent.trim() : '';
            }

            data.push(rowData);
        });

        return data;
    }

    // Extract data from vendor analytics table
    function extractVendorAnalyticsData(columns) {
        const rows = document.querySelectorAll('tr[id^="row-"]');
        const data = [];

        rows.forEach(row => {
            const rowData = {};

            if (columns.includes('asin')) {
                const asinLink = row.querySelector('.font-mono.font-bold');
                rowData.asin = asinLink ? asinLink.textContent.trim() : '';
            }
            if (columns.includes('title')) {
                const titleDiv = row.querySelector('.text-xs.text-slate-500');
                rowData.title = titleDiv ? (titleDiv.getAttribute('title') || titleDiv.textContent.trim()) : '';
            }
            if (columns.includes('sku')) {
                const skuSpan = row.querySelector('.text-purple-600');
                if (skuSpan) {
                    const skuMatch = skuSpan.textContent.match(/SKU:\s*(.+)/);
                    rowData.sku = skuMatch ? skuMatch[1].trim() : '';
                } else {
                    rowData.sku = '';
                }
            }
            if (columns.includes('availability')) {
                const statusBadge = row.querySelector('.col-status .font-bold');
                rowData.availability = statusBadge ? statusBadge.textContent.trim() : '';
            }
            if (columns.includes('price')) {
                const priceDiv = row.querySelector('.col-status .text-slate-600');
                rowData.price = priceDiv ? priceDiv.textContent.trim() : '';
            }

            // RT Inventory
            if (columns.includes('rt_inv_available')) {
                const rtInvCell = row.querySelector('.col-rt-inv .font-bold');
                rowData.rt_inv_available = rtInvCell ? rtInvCell.textContent.trim() : '';
            }

            // RT Sales
            const rtSalesCell = row.querySelector('.col-rt-sales');
            if (rtSalesCell) {
                if (columns.includes('rt_sales_shipped')) {
                    const shippedMatch = rtSalesCell.textContent.match(/(\d+)\s*shipped/i);
                    rowData.rt_sales_shipped = shippedMatch ? shippedMatch[1] : '';
                }
                if (columns.includes('rt_sales_revenue')) {
                    const revenueMatch = rtSalesCell.textContent.match(/\$([0-9,]+\.?\d*)/);
                    rowData.rt_sales_revenue = revenueMatch ? revenueMatch[1] : '';
                }
            }

            // Weekly Sales
            const salesCell = row.querySelector('.col-sales');
            if (salesCell) {
                if (columns.includes('sales_shipped')) {
                    const shippedDiv = salesCell.querySelector('.font-bold');
                    rowData.sales_shipped = shippedDiv ? shippedDiv.textContent.replace(/[^0-9]/g, '') : '';
                }
                if (columns.includes('sales_ordered')) {
                    const orderedMatch = salesCell.textContent.match(/Ordered:\s*(\d+)/i);
                    rowData.sales_ordered = orderedMatch ? orderedMatch[1] : '';
                }
                if (columns.includes('sales_revenue')) {
                    const revenueDiv = salesCell.querySelector('.text-emerald-600');
                    rowData.sales_revenue = revenueDiv ? revenueDiv.textContent.trim() : '';
                }
            }

            // Traffic
            if (columns.includes('traffic_views')) {
                const trafficCell = row.querySelector('.col-traffic .font-bold');
                rowData.traffic_views = trafficCell ? trafficCell.textContent.replace(/[^0-9]/g, '') : '';
            }

            // Inventory
            if (columns.includes('inventory_sellable')) {
                const invCell = row.querySelector('.col-inventory .font-bold');
                rowData.inventory_sellable = invCell ? invCell.textContent.replace(/[^0-9]/g, '') : '';
            }

            // Last Ordered
            const lastOrderedCell = row.querySelector('.col-last-ordered');
            if (lastOrderedCell) {
                if (columns.includes('last_po_date')) {
                    const dateDiv = lastOrderedCell.querySelector('.font-bold');
                    rowData.last_po_date = dateDiv ? dateDiv.textContent.trim() : '';
                }
                if (columns.includes('po_count')) {
                    const countMatch = lastOrderedCell.textContent.match(/(\d+)\s*PO/i);
                    rowData.po_count = countMatch ? countMatch[1] : '';
                }
            }

            // Received
            const receivedCell = row.querySelector('.col-received');
            if (receivedCell) {
                if (columns.includes('total_ordered')) {
                    const orderedMatch = receivedCell.textContent.match(/of\s*([0-9,]+)/);
                    rowData.total_ordered = orderedMatch ? orderedMatch[1].replace(/,/g, '') : '';
                }
                if (columns.includes('total_received')) {
                    const receivedDiv = receivedCell.querySelector('.font-bold');
                    rowData.total_received = receivedDiv ? receivedDiv.textContent.replace(/[^0-9]/g, '') : '';
                }
            }

            data.push(rowData);
        });

        return data;
    }

    // Generate CSV from data
    function generateCSV(selectedColumns, pageType) {
        let data;
        const columnDefs = COLUMN_DEFINITIONS[pageType];

        // Extract data based on page type
        switch(pageType) {
            case 'dashboard':
                data = extractDashboardData(selectedColumns);
                break;
            case 'purchaseOrders':
                data = extractPurchaseOrdersData(selectedColumns);
                break;
            case 'vendorAnalytics':
                data = extractVendorAnalyticsData(selectedColumns);
                break;
            default:
                console.error('Unknown page type:', pageType);
                return null;
        }

        if (!data || data.length === 0) {
            alert('No data available to export');
            return null;
        }

        // Build CSV header
        const headers = selectedColumns.map(colId => {
            const def = columnDefs.find(c => c.id === colId);
            return def ? def.label : colId;
        });

        let csv = headers.map(h => escapeCSV(h)).join(',') + '\n';

        // Build CSV rows
        data.forEach(row => {
            const values = selectedColumns.map(colId => {
                return escapeCSV(row[colId] || '');
            });
            csv += values.join(',') + '\n';
        });

        return csv;
    }

    // Download CSV file
    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Open column selector modal
    function openColumnSelector(pageType) {
        const modal = document.getElementById('csvColumnModal');
        const checkboxContainer = document.getElementById('csvColumnCheckboxes');
        const columnDefs = COLUMN_DEFINITIONS[pageType];

        if (!modal || !checkboxContainer) {
            console.error('CSV modal elements not found');
            return;
        }

        // Clear previous checkboxes
        checkboxContainer.innerHTML = '';

        // Create checkboxes
        columnDefs.forEach(col => {
            const label = document.createElement('label');
            label.className = 'flex items-center gap-2 px-4 py-2 hover:bg-slate-50 cursor-pointer rounded';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'csv-column-checkbox w-4 h-4';
            checkbox.value = col.id;
            checkbox.checked = col.default;

            const span = document.createElement('span');
            span.className = 'text-sm text-slate-700';
            span.textContent = col.label;

            label.appendChild(checkbox);
            label.appendChild(span);
            checkboxContainer.appendChild(label);
        });

        // Store page type for export
        modal.setAttribute('data-page-type', pageType);

        // Show modal
        modal.style.display = 'block';
    }

    // Close modal
    function closeColumnSelector() {
        const modal = document.getElementById('csvColumnModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Export with selected columns
    function exportSelectedColumns() {
        const modal = document.getElementById('csvColumnModal');
        const pageType = modal.getAttribute('data-page-type');
        const checkboxes = document.querySelectorAll('.csv-column-checkbox:checked');

        if (checkboxes.length === 0) {
            alert('Please select at least one column to export');
            return;
        }

        const selectedColumns = Array.from(checkboxes).map(cb => cb.value);
        const csv = generateCSV(selectedColumns, pageType);

        if (csv) {
            const timestamp = new Date().toISOString().split('T')[0];
            const pageNames = {
                dashboard: 'dashboard',
                purchaseOrders: 'purchase-orders',
                vendorAnalytics: 'vendor-analytics'
            };
            const filename = `${pageNames[pageType]}_export_${timestamp}.csv`;
            downloadCSV(csv, filename);
            closeColumnSelector();
        }
    }

    // Select/Deselect all columns
    function toggleAllColumns(checked) {
        const checkboxes = document.querySelectorAll('.csv-column-checkbox');
        checkboxes.forEach(cb => cb.checked = checked);
    }

    // Expose public API
    window.CSVExport = {
        openColumnSelector,
        closeColumnSelector,
        exportSelectedColumns,
        toggleAllColumns
    };

})();
