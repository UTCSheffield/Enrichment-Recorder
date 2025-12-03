(() => {
    const q = sel => document.querySelector(sel); // Shorted code since it's used a million times
    const api = async (action, method = 'GET', body = null) => {
        const opts = { method, headers: {} };
        let url = `/?action=${encodeURIComponent(action)}`;
        if (method === 'GET') {
            if (body && typeof body === 'object') {
                url += '&' + new URLSearchParams(body).toString();
            }
        } else {
            opts.body = new URLSearchParams(body || {});
        }
        const res = await fetch(url, opts);
        return res.json();
    };

    // state
    let state = { students: [], activities: [], attendance: {} };
    let selectedActivity = null;
    let selectedWeekStart = null;
    let focusedRow = 0;

    // UI elements
    const activitiesList = q('#activitiesList');
    const addActivityBtn = q('#addActivityBtn');
    const weekStartInput = q('#weekStart');
    const registerArea = q('#registerArea');
    const statsArea = q('#statsArea');
    const navStats = q('#navStats');
    const activityTitle = q('#activityTitle');
    const editActivityBtn = q('#editActivityBtn');
    const toggleThemeBtn = q('#toggleTheme');

    // Stats Elements
    const statTotalStudents = q('#statTotalStudents');
    const statTotalActivities = q('#statTotalActivities');
    const statTotalAttendance = q('#statTotalAttendance');
    const statsTable = q('#statsTable tbody');
    const statsSearch = q('#statsSearch');
    const downloadCsvBtn = q('#downloadCsvBtn');
    let chartWeekly = null;
    let chartActivities = null;
    let statsData = null;

    // Modal elements
    const addStudentBtn = q('#addStudentBtn');
    const studentModal = q('#studentModal');
    const studentForm = q('#studentForm');
    const studentIdInput = q('#studentIdInput');
    const firstNameInput = q('#firstName');
    const lastNameInput = q('#lastName');
    const studentModalTitle = q('#studentModalTitle');
    const saveStudentBtn = q('#saveStudentBtn');
    const deleteStudentBtn = q('#deleteStudentBtn');

    const activityModal = q('#activityModal');
    const activityForm = q('#activityForm');
    const activityIdInput = q('#activityIdInput');
    const activityNameInput = q('#activityNameInput');
    const activityDescriptionInput = q('#activityDescriptionInput');
    const activitySessionsInput = q('#activitySessions');
    const activityModalTitle = q('#activityModalTitle');
    const saveActivityBtn = q('#saveActivityBtn');
    const deleteActivityBtn = q('#deleteActivityBtn');

    const closeModalBtns = document.querySelectorAll('.close-modal');

    function isoMonday(d = new Date()) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        date.setDate(date.getDate() + diff);
        date.setHours(0, 0, 0, 0);
        return date.toISOString().slice(0, 10);
    }

    async function loadState() {
        const res = await api('get_state');
        if (res.error) return alert(res.error);
        state.students = res.students;
        state.activities = res.activities;
        renderActivities();
        if (!selectedWeekStart) selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;

        // If we are in stats mode, don't auto-select activity
        if (registerArea.style.display !== 'none' && state.activities.length && !selectedActivity) {
            selectActivity(state.activities[0].id);
        }
    }

    function renderActivities() {
        activitiesList.innerHTML = '';
        state.activities.forEach(a => {
            const el = document.createElement('div');
            el.tabIndex = 0;
            el.className = 'nav-item' + (selectedActivity === a.id ? ' active' : '');
            el.innerHTML = `<span>${a.name}</span><span class="meta">${a.sessions_per_week}/wk</span>`;
            el.onclick = () => selectActivity(a.id);
            activitiesList.appendChild(el);
        });
    }

    async function selectActivity(id) {
        selectedActivity = id;
        registerArea.style.display = 'block';
        statsArea.style.display = 'none';
        navStats.classList.remove('active');

        renderActivities();
        const act = state.activities.find(x => x.id == id);
        activityTitle.textContent = act ? act.name : 'Register';
        if (act) {
            editActivityBtn.style.display = 'flex';
        } else {
            editActivityBtn.style.display = 'none';
        }
        await loadAttendance();
    }

    async function loadStats() {
        selectedActivity = null;
        renderActivities(); // Clear active state
        navStats.classList.add('active');
        registerArea.style.display = 'none';
        statsArea.style.display = 'block';
        activityTitle.textContent = 'Statistics';
        editActivityBtn.style.display = 'none';

        const res = await api('get_stats');
        if (res.error) return alert(res.error);
        statsData = res.stats;

        renderStatsDashboard();
    }

    function renderStatsDashboard() {
        if (!statsData) return;

        // KPI Cards
        statTotalStudents.textContent = state.students.length;
        statTotalActivities.textContent = state.activities.length;

        // Calculate total attendance
        const totalAtt = Object.values(statsData.students).reduce((a, b) => a + parseInt(b), 0);
        statTotalAttendance.textContent = totalAtt;

        // Charts
        renderCharts();

        // Table
        renderStatsTable();
    }

    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });
    }

    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.toLowerCase();

        state.students.forEach(s => {
            if (term && !s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    navStats.addEventListener('click', loadStats);
    statsSearch.addEventListener('input', (e) => renderStatsTable(e.target.value));

    downloadCsvBtn.addEventListener('click', () => {
        let csv = 'Student Name,Total Sessions Attended,Assigned Activities\n';
        state.students.forEach(s => {
            const attended = statsData.students[s.id] || 0;
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join('; '); // Semicolon for CSV safety

            // Escape quotes
            const safeName = `"${s.name.replace(/"/g, '""')}"`;
            const safeActs = `"${actNames.replace(/"/g, '""')}"`;

            csv += `${safeName},${attended},${safeActs}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enrichment_stats_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    });


    async function loadAttendance() {
        if (!selectedActivity) return;
        const res = await api('get_attendance', 'GET', { activity_id: selectedActivity, week_start: selectedWeekStart });
        state.attendance = res.attendance || {};
        renderRegister();
    }

    // Tag Management Logic
    let currentActivityStudentIds = [];
    const activityStudentTags = q('#activityStudentTags');
    const addStudentTagBtn = q('#addStudentTagBtn');
    const studentPickerDropdown = q('#studentPickerDropdown');
    const studentPickerSearch = q('#studentPickerSearch');
    const studentPickerList = q('#studentPickerList');

    function renderStudentTags() {
        // Clear existing tags but keep the add button
        const tags = activityStudentTags.querySelectorAll('.tag-chip');
        tags.forEach(t => t.remove());

        currentActivityStudentIds.forEach(sid => {
            const s = state.students.find(x => x.id == sid);
            if (!s) return;

            const chip = document.createElement('div');
            chip.className = 'tag-chip';
            chip.innerHTML = `
            <span>${s.name}</span>
            <span class="tag-remove" data-id="${sid}">&times;</span>
          `;
            chip.querySelector('.tag-remove').onclick = () => {
                currentActivityStudentIds = currentActivityStudentIds.filter(id => id !== sid);
                renderStudentTags();
            };
            activityStudentTags.insertBefore(chip, addStudentTagBtn);
        });
    }

    function renderStudentPicker(filter = '') {
        studentPickerList.innerHTML = '';
        const available = state.students.filter(s => !currentActivityStudentIds.includes(s.id));
        const filtered = available.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            studentPickerList.innerHTML = '<div style="padding:8px; color:var(--text-secondary); font-size:12px;">No students found</div>';
            return;
        }

        filtered.forEach(s => {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = s.name;
            item.onclick = () => {
                currentActivityStudentIds.push(s.id);
                renderStudentTags();
                studentPickerDropdown.style.display = 'none';
                studentPickerSearch.value = '';
            };
            studentPickerList.appendChild(item);
        });
    }

    addStudentTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = addStudentTagBtn.getBoundingClientRect();
        // Position dropdown relative to button or container
        // Simple toggle for now
        const isVisible = studentPickerDropdown.style.display === 'flex';
        studentPickerDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            renderStudentPicker();
            studentPickerSearch.focus();
        }
    });

    studentPickerSearch.addEventListener('input', (e) => {
        renderStudentPicker(e.target.value);
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!studentPickerDropdown.contains(e.target) && e.target !== addStudentTagBtn) {
            studentPickerDropdown.style.display = 'none';
        }
    });

    function renderRegister() {
        if (!selectedActivity) {
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            return;
        }
        const act = state.activities.find(x => x.id == selectedActivity);
        const sessions = act.sessions_per_week;

        // Filter students based on activity association
        // If student_ids is undefined (legacy), show all? Or show none?
        // Let's assume if the array exists, we filter. If it's missing, we show all (backward compat)
        // But we just added it to DB, so it will be empty array for existing activities.
        // User wants "only shows certain students". So empty array = no students.
        const activityStudents = (act.student_ids || []).map(id => state.students.find(s => s.id == id)).filter(Boolean);

        // Sort by name
        activityStudents.sort((a, b) => a.name.localeCompare(b.name));

        const table = document.createElement('table');
        table.className = 'students-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.innerHTML = `<th>Student</th>` + Array.from({ length: sessions }).map((_, i) => `<th>Session ${i + 1}</th>`).join('');
        thead.appendChild(headRow); table.appendChild(thead);
        const tbody = document.createElement('tbody');

        if (activityStudents.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="${sessions + 1}" style="text-align:center; color:var(--text-secondary); padding: 20px;">No students assigned to this activity. Edit activity to add students.</td>`;
            tbody.appendChild(tr);
        }

        activityStudents.forEach((s, idx) => {
            const tr = document.createElement('tr');
            tr.className = 'student-row' + (idx === focusedRow ? ' focused' : '');

            const nameTd = document.createElement('td');

            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'space-between';
            wrapper.style.width = '100%';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = s.name;
            wrapper.appendChild(nameSpan);

            const editBtn = document.createElement('button');
            editBtn.className = 'icon-btn';
            editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
            editBtn.style.opacity = '0.5';
            editBtn.style.padding = '4px';
            editBtn.onclick = (e) => { e.stopPropagation(); openEditStudentModal(s); };
            editBtn.onmouseover = () => editBtn.style.opacity = '1';
            editBtn.onmouseout = () => editBtn.style.opacity = '0.5';

            wrapper.appendChild(editBtn);
            nameTd.appendChild(wrapper);
            tr.appendChild(nameTd);

            for (let si = 1; si <= sessions; si++) {
                const td = document.createElement('td');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                const present = state.attendance[s.id] && state.attendance[s.id][si] === 1;
                cb.checked = !!present;
                cb.addEventListener('change', () => toggleAttendance(s.id, si, cb.checked));
                td.appendChild(cb);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        registerArea.innerHTML = '';
        registerArea.appendChild(table);
    }

    async function toggleAttendance(student_id, session_index, present) {
        await api('toggle_attendance', 'POST', { student_id, activity_id: selectedActivity, week_start: selectedWeekStart, session_index, present: present ? 1 : 0 });
        if (!state.attendance[student_id]) state.attendance[student_id] = {};
        state.attendance[student_id][session_index] = present ? 1 : 0;
    }

    activityForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = activityIdInput.value;
        const name = activityNameInput.value.trim();
        const description = activityDescriptionInput.value.trim();
        const sessions = activitySessionsInput.value;

        if (!name) return;

        // Pass student_ids as comma separated string
        const studentIdsStr = currentActivityStudentIds.join(',');

        let res;
        if (id) {
            // Update
            res = await api('update_activity', 'POST', { id, name, description, sessions_per_week: sessions, student_ids: studentIdsStr });
        } else {
            // Create
            res = await api('create_activity', 'POST', { name, description, sessions_per_week: sessions, student_ids: studentIdsStr });
        }

        if (res.ok) {
            closeModal(activityModal);
            await loadState();
            if (id) {
                selectActivity(id); // Refresh current view
            } else {
                selectActivity(res.id); // Select new
            }
        } else alert(res.error || 'Failed');
    });

    deleteActivityBtn.addEventListener('click', async () => {
        const id = activityIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this activity? All attendance data will be lost.')) return;

        const res = await api('delete_activity', 'POST', { id });
        if (res.ok) {
            closeModal(activityModal);
            selectedActivity = null;
            activityTitle.textContent = 'Select Activity';
            editActivityBtn.style.display = 'none';
            registerArea.innerHTML = '<div class="empty-state">Select an activity from the sidebar to view the register.</div>';
            await loadState();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    // Modal Logic
    function openModal(modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        const input = modal.querySelector('input');
        if (input) input.focus();
    }

    function openCreateActivityModal() {
        activityIdInput.value = '';
        activityNameInput.value = '';
        activityDescriptionInput.value = '';
        activitySessionsInput.value = '1';
        activityModalTitle.textContent = 'New Activity';
        saveActivityBtn.textContent = 'Create Activity';
        deleteActivityBtn.style.display = 'none';

        currentActivityStudentIds = [];
        renderStudentTags();

        openModal(activityModal);
    }

    function openEditActivityModal() {
        if (!selectedActivity) return;
        const act = state.activities.find(x => x.id == selectedActivity);
        if (!act) return;

        activityIdInput.value = act.id;
        activityNameInput.value = act.name;
        activityDescriptionInput.value = act.description || '';
        activitySessionsInput.value = act.sessions_per_week;
        activityModalTitle.textContent = 'Edit Activity';
        saveActivityBtn.textContent = 'Save Changes';
        deleteActivityBtn.style.display = 'block';

        currentActivityStudentIds = [...(act.student_ids || [])];
        renderStudentTags();

        openModal(activityModal);
    }

    function closeModal(modal) {
        // If no modal passed, close all active ones
        if (!modal) {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m));
            return;
        }
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        const form = modal.querySelector('form');
        if (form) form.reset();
    }

    function openCreateStudentModal() {
        studentIdInput.value = '';
        firstNameInput.value = '';
        lastNameInput.value = '';
        studentModalTitle.textContent = 'Add New Student';
        saveStudentBtn.textContent = 'Add Student';
        deleteStudentBtn.style.display = 'none';
        openModal(studentModal);
    }

    function openEditStudentModal(student) {
        studentIdInput.value = student.id;
        const parts = student.name.split(' ');
        firstNameInput.value = parts[0] || '';
        lastNameInput.value = parts.slice(1).join(' ') || '';
        studentModalTitle.textContent = 'Edit Student';
        saveStudentBtn.textContent = 'Save Changes';
        deleteStudentBtn.style.display = 'block';
        openModal(studentModal);
    }

    addStudentBtn.addEventListener('click', openCreateStudentModal);
    if (addActivityBtn) addActivityBtn.addEventListener('click', openCreateActivityModal);
    if (editActivityBtn) editActivityBtn.addEventListener('click', openEditActivityModal);

    closeModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        closeModal(modal);
    }));

    // Close on click outside
    [studentModal, activityModal, q('#studentStatsModal'), q('#activityStatsModal')].forEach(m => {
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) closeModal(m);
        });
    });

    // Close on Escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // --- Student Stats Logic ---
    const studentStatsModal = q('#studentStatsModal');
    const studentStatsTitle = q('#studentStatsTitle');
    const studentTotalSessions = q('#studentTotalSessions');
    const studentTotalActivities = q('#studentTotalActivities');
    const studentActivityList = q('#studentActivityList');
    const studentHistoryList = q('#studentHistoryList');
    const downloadStudentCsvBtn = q('#downloadStudentCsvBtn');
    let currentStatsStudent = null;

    async function openStudentStats(student) {
        currentStatsStudent = student;
        studentStatsTitle.textContent = student.name;

        const res = await api('get_student_stats', 'GET', { id: student.id });
        if (res.error) return alert(res.error);
        const stats = res.stats;

        studentTotalSessions.textContent = stats.total;
        studentTotalActivities.textContent = Object.keys(stats.by_activity).length;

        // Activity List
        studentActivityList.innerHTML = '';
        Object.entries(stats.by_activity).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            studentActivityList.appendChild(div);
        });

        // History List
        studentHistoryList.innerHTML = '';
        stats.history.forEach(h => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.fontSize = '13px';
            div.innerHTML = `
            <div style="display:flex; justify-content:space-between; color:var(--text-secondary); font-size:11px; margin-bottom:2px;">
                <span>${h.week_start}</span>
                <span>Session ${h.session_index}</span>
            </div>
            <div>${h.activity_name}</div>
          `;
            studentHistoryList.appendChild(div);
        });

        openModal(studentStatsModal);
    }

    downloadStudentCsvBtn.addEventListener('click', async () => {
        if (!currentStatsStudent) return;
        const res = await api('get_student_stats', 'GET', { id: currentStatsStudent.id });
        const stats = res.stats;

        let csv = `Student Report: ${currentStatsStudent.name}\n\n`;
        csv += `Total Sessions,${stats.total}\n\n`;

        csv += `Activity Breakdown\nActivity,Sessions\n`;
        Object.entries(stats.by_activity).forEach(([name, count]) => {
            csv += `"${name}",${count}\n`;
        });

        csv += `\nDetailed History\nDate,Activity,Session\n`;
        stats.history.forEach(h => {
            csv += `${h.week_start},"${h.activity_name}",${h.session_index}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentStatsStudent.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // --- Activity Stats Logic ---
    const activityStatsModal = q('#activityStatsModal');
    const activityStatsTitle = q('#activityStatsTitle');
    const activityTotalAttendance = q('#activityTotalAttendance');
    const activityStudentList = q('#activityStudentList');
    const downloadActivityCsvBtn = q('#downloadActivityCsvBtn');
    let currentStatsActivity = null;
    let activityTrendChartInstance = null;

    async function openActivityStats(activityId) {
        const act = state.activities.find(a => a.id == activityId);
        if (!act) return;
        currentStatsActivity = act;
        activityStatsTitle.textContent = act.name;

        const res = await api('get_activity_stats', 'GET', { id: act.id });
        if (res.error) return alert(res.error);
        const stats = res.stats;

        activityTotalAttendance.textContent = stats.total;

        // Student List
        activityStudentList.innerHTML = '';
        Object.entries(stats.by_student).forEach(([name, count]) => {
            const div = document.createElement('div');
            div.style.padding = '8px 12px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${name}</span><span style="font-weight:600">${count}</span>`;
            activityStudentList.appendChild(div);
        });

        // Chart
        const ctx = q('#activityTrendChart').getContext('2d');
        if (activityTrendChartInstance) activityTrendChartInstance.destroy();

        activityTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: stats.weekly.map(x => x.week_start),
                datasets: [{
                    label: 'Attendance',
                    data: stats.weekly.map(x => x.count),
                    borderColor: '#34c759',
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } }
            }
        });

        openModal(activityStatsModal);
    }

    downloadActivityCsvBtn.addEventListener('click', async () => {
        if (!currentStatsActivity) return;
        const res = await api('get_activity_stats', 'GET', { id: currentStatsActivity.id });
        const stats = res.stats;

        let csv = `Activity Report: ${currentStatsActivity.name}\n\n`;
        csv += `Total Attendance,${stats.total}\n\n`;

        csv += `Student Breakdown\nStudent,Sessions Attended\n`;
        Object.entries(stats.by_student).forEach(([name, count]) => {
            csv += `"${name}",${count}\n`;
        });

        csv += `\nWeekly Trend\nWeek,Count\n`;
        stats.weekly.forEach(w => {
            csv += `${w.week_start},${w.count}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentStatsActivity.name.replace(/\s+/g, '_')}_report.csv`;
        a.click();
    });

    // Update renderStatsTable to be clickable
    function renderStatsTable(filter = '') {
        statsTable.innerHTML = '';
        const term = filter.toLowerCase();

        state.students.forEach(s => {
            if (term && !s.name.toLowerCase().includes(term)) return;

            const attended = statsData.students[s.id] || 0;

            // Find which activities they are in
            const inActivities = state.activities.filter(a => (a.student_ids || []).includes(s.id));
            const actNames = inActivities.map(a => a.name).join(', ');

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.className = 'student-row';
            tr.onclick = () => openStudentStats(s);

            tr.innerHTML = `
            <td>${s.name}</td>
            <td>${attended}</td>
            <td>${actNames || '<span style="color:var(--text-secondary)">None</span>'}</td>
          `;
            statsTable.appendChild(tr);
        });
    }

    // Update renderCharts to be clickable
    function renderCharts() {
        const ctxWeekly = q('#chartWeekly').getContext('2d');
        const ctxActivities = q('#chartActivities').getContext('2d');

        // Destroy existing
        if (chartWeekly) chartWeekly.destroy();
        if (chartActivities) chartActivities.destroy();

        // Weekly Data
        const weeks = statsData.weekly.map(x => x.week_start);
        const weekCounts = statsData.weekly.map(x => x.count);

        chartWeekly = new Chart(ctxWeekly, {
            type: 'line',
            data: {
                labels: weeks,
                datasets: [{
                    label: 'Attendance',
                    data: weekCounts,
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
            }
        });

        // Activity Data
        const actLabels = [];
        const actCounts = [];
        const actIds = [];
        state.activities.forEach(a => {
            actLabels.push(a.name);
            actCounts.push(statsData.activities[a.id] || 0);
            actIds.push(a.id);
        });

        chartActivities = new Chart(ctxActivities, {
            type: 'bar',
            data: {
                labels: actLabels,
                datasets: [{
                    label: 'Sessions',
                    data: actCounts,
                    backgroundColor: [
                        '#007aff', '#34c759', '#ff9500', '#ff3b30', '#5856d6', '#af52de'
                    ],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const activityId = actIds[index];
                        openActivityStats(activityId);
                    }
                }
            }
        });
    }

    studentForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = studentIdInput.value;
        const first = firstNameInput.value.trim();
        const last = lastNameInput.value.trim();
        if (!first || !last) return;

        const fullName = `${first} ${last}`;

        let res;
        if (id) {
            res = await api('update_student', 'POST', { id, name: fullName });
        } else {
            res = await api('create_student', 'POST', { name: fullName });
        }

        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
        } else alert(res.error || 'Failed');
    });

    deleteStudentBtn.addEventListener('click', async () => {
        const id = studentIdInput.value;
        if (!id) return;
        if (!confirm('Are you sure you want to delete this student? All their attendance data will be lost.')) return;

        const res = await api('delete_student', 'POST', { id });
        if (res.ok) {
            closeModal(studentModal);
            await loadState();
            await loadAttendance();
        } else {
            alert(res.error || 'Failed to delete');
        }
    });

    weekStartInput.addEventListener('change', async e => {
        // Native change event might trigger if flatpickr doesn't suppress it, 
        // but we handle it in flatpickr config below.
        // Keeping this for fallback if flatpickr fails to load.
        if (!weekStartInput._flatpickr) {
            selectedWeekStart = weekStartInput.value;
            await loadAttendance();
        }
    });

    // Initialize Flatpickr
    if (window.flatpickr) {
        flatpickr(weekStartInput, {
            dateFormat: "Y-m-d",
            defaultDate: isoMonday(),
            disableMobile: "true",
            plugins: [new weekSelect({})],
            locale: {
                firstDayOfWeek: 1 // Start week on Monday
            },
            altInput: true,
            altFormat: "\\W\\e\\e\\k \\o\\f F j, Y", // "Week of December 4, 2023"
            onChange: async function (selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    // The weekSelect plugin sets the date to the start of the week
                    const d = selectedDates[0];
                    // Ensure we have the ISO string for the API
                    // Adjust to local Monday to avoid timezone issues if necessary, 
                    // but flatpickr usually handles this well with the plugin.
                    // Let's use our isoMonday helper to be safe and consistent with the backend expectation.
                    const monday = isoMonday(d);

                    if (monday !== selectedWeekStart) {
                        selectedWeekStart = monday;
                        await loadAttendance();
                    }
                }
            }
        });
    }

    // keyboard navigation
    window.addEventListener('keydown', e => {
        const table = document.querySelector('.students-table');
        if (!table) return;
        // Only capture navigation keys if we aren't in an input or textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (['ArrowUp', 'ArrowDown', ' '].includes(e.key) || /^[1-7]$/.test(e.key)) {
            e.preventDefault();
        }
        if (e.key === 'ArrowUp') { focusedRow = Math.max(0, focusedRow - 1); renderRegister(); }
        if (e.key === 'ArrowDown') { focusedRow = Math.min(state.students.length - 1, focusedRow + 1); renderRegister(); }
        if (e.key === ' ') { // toggle session 1
            const s = state.students[focusedRow]; if (!s) return; const cb = document.querySelectorAll('.students-table tbody tr')[focusedRow].querySelector('input'); if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
        if (/^[1-7]$/.test(e.key)) {
            const si = parseInt(e.key, 10);
            const s = state.students[focusedRow]; if (!s) return; const row = document.querySelectorAll('.students-table tbody tr')[focusedRow]; const inputs = row.querySelectorAll('input'); if (si - 1 < inputs.length) { const cb = inputs[si - 1]; cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
    });

    // CSV Upload Logic
    const uploadCsvLink = q('#uploadCsvLink');
    const csvUpload = q('#csvUpload');

    if (uploadCsvLink && csvUpload) {
        uploadCsvLink.addEventListener('click', (e) => {
            e.preventDefault();
            csvUpload.click();
        });

        csvUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const text = await file.text();
            const lines = text.split(/\r?\n/);
            let count = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Format: LASTNAME Firstname
                const parts = trimmed.split(/\s+/);
                if (parts.length < 2) continue;

                // Capitalize function
                const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

                // Assume first part is Last Name, rest is First Name
                let lastName = capitalize(parts[0]);
                let firstName = parts.slice(1).map(p => capitalize(p)).join(' ');

                const fullName = `${firstName} ${lastName}`;

                const res = await api('create_student', 'POST', { name: fullName });
                if (res.ok) count++;
            }

            if (count > 0) {
                alert(`Successfully added ${count} students.`);
                closeModal(studentModal);
                await loadState();
                await loadAttendance();
            } else {
                alert('No valid students found in CSV.');
            }

            csvUpload.value = ''; // Reset
        });
    }

    // theme
    function loadTheme() {
        const root = document.documentElement;
        const t = localStorage.getItem('theme') || 'dark';
        if (t === 'light') root.classList.add('light'); else root.classList.remove('light');
    }
    toggleThemeBtn.addEventListener('click', () => {
        const root = document.documentElement;
        root.classList.toggle('light');
        localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
    });

    // init
    (async function () {
        loadTheme();
        selectedWeekStart = isoMonday();
        weekStartInput.value = selectedWeekStart;
        await loadState();
    })();

})();
