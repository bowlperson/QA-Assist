(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const tableBody = document.getElementById('siteListBody');
        const searchInput = document.getElementById('siteSearch');
        const statusMessage = document.getElementById('siteStatus');

        let sites = [];

        function setStatus(message, isError) {
            if (!statusMessage) {
                return;
            }
            statusMessage.textContent = message || '';
            statusMessage.style.color = isError ? '#ff9090' : '#8fd18b';
        }

        function parseSites(text) {
            const lines = text.split(/\r?\n/);
            const parsed = [];
            lines.forEach(function (line) {
                const trimmed = line.trim();
                if (!trimmed) {
                    return;
                }
                const hostMatch = trimmed.match(/(https?:\/\/[^\s]+|\(?\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\)?)/);
                if (!hostMatch) {
                    return;
                }
                const hostRaw = hostMatch[1].replace(/[()]/g, '');
                const name = trimmed.slice(0, hostMatch.index).trim();
                const rest = trimmed.slice(hostMatch.index + hostMatch[1].length).trim();

                let url = hostRaw;
                if (!/^https?:\/\//i.test(hostRaw)) {
                    if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(hostRaw)) {
                        url = 'http://' + hostRaw;
                    } else {
                        url = 'https://' + hostRaw;
                    }
                }

                parsed.push({
                    name: name || hostRaw,
                    address: hostRaw,
                    url: url,
                    note: rest,
                });
            });
            return parsed;
        }

        function render(filterText) {
            tableBody.innerHTML = '';
            const keyword = (filterText || '').toLowerCase();
            const filtered = sites.filter(function (site) {
                if (!keyword) {
                    return true;
                }
                return (
                    site.name.toLowerCase().indexOf(keyword) !== -1 ||
                    site.address.toLowerCase().indexOf(keyword) !== -1 ||
                    (site.note && site.note.toLowerCase().indexOf(keyword) !== -1)
                );
            });

            if (!filtered.length) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 3;
                cell.className = 'table-empty';
                cell.textContent = 'No matching sites found.';
                row.appendChild(cell);
                tableBody.appendChild(row);
                return;
            }

            filtered.forEach(function (site) {
                const row = document.createElement('tr');
                const nameCell = document.createElement('td');
                nameCell.textContent = site.name;

                const addressCell = document.createElement('td');
                const link = document.createElement('a');
                link.href = site.url;
                link.textContent = site.address;
                link.className = 'address-link';
                link.target = '_blank';
                addressCell.appendChild(link);

                const notesCell = document.createElement('td');
                notesCell.className = 'notes-cell';
                notesCell.textContent = site.note || '';

                row.appendChild(nameCell);
                row.appendChild(addressCell);
                row.appendChild(notesCell);
                tableBody.appendChild(row);
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', function () {
                render(searchInput.value);
            });
        }

        fetch(chrome.runtime.getURL('sitelist.txt'))
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Unable to load site list');
                }
                return response.text();
            })
            .then(function (text) {
                sites = parseSites(text);
                if (!sites.length) {
                    setStatus('Site list is empty.', true);
                } else {
                    setStatus('Loaded ' + sites.length + ' sites.');
                }
                render('');
            })
            .catch(function () {
                setStatus('Failed to load site information.', true);
            });
    });
})();
