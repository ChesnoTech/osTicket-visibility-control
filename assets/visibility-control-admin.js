(function($) {
    'use strict';

    var D = window.VC_DATA;
    if (!D) return;

    var i18n = D.i18n;
    var state = {
        tab: 'status',       // 'status' | 'transfer' | 'updates'
        scope: 'agent',      // 'agent' | 'department'
        search: '',
        deptFilter: '',      // '' = all depts, else dept_id (string) — only used for agent scope
        dirty: {},           // key -> true (unsaved changes)
        rules: {}            // key -> [targetId, ...] or null (unrestricted)
    };

    // ================================================================
    //  Init: index rules into lookup
    // ================================================================

    function initRules() {
        state.rules = {};
        (D.rules || []).forEach(function(r) {
            var key = r.rule_type + ':' + r.scope_type + ':' + r.scope_id;
            state.rules[key] = r.target_ids.slice();
        });
    }
    initRules();

    function getRuleKey(ruleType, scopeType, scopeId) {
        return ruleType + ':' + scopeType + ':' + scopeId;
    }

    function getAllowedIds(ruleType, scopeType, scopeId) {
        var key = getRuleKey(ruleType, scopeType, scopeId);
        return state.rules[key] || null; // null = unrestricted
    }

    function setAllowedIds(ruleType, scopeType, scopeId, ids) {
        var key = getRuleKey(ruleType, scopeType, scopeId);
        if (ids === null) {
            delete state.rules[key];
        } else {
            state.rules[key] = ids;
        }
        state.dirty[key] = true;
    }

    // ================================================================
    //  Render
    // ================================================================

    function render() {
        var $app = $('#vc-app');
        $app.empty();

        // Header
        $app.append('<div class="vc-header"><h1>' + esc(i18n.title) + '</h1></div>');

        // Tabs
        var $tabs = $('<div class="vc-tabs"></div>');
        $tabs.append(tabBtn('status', i18n.statusRules));
        $tabs.append(tabBtn('transfer', i18n.transferRules));
        $tabs.append(tabBtn('updates', i18n.updates || 'Updates'));
        $app.append($tabs);

        if (state.tab === 'updates') {
            renderUpdatesTab($app);
            return;
        }

        // Scope toggle
        var $scope = $('<div class="vc-scope-toggle"></div>');
        $scope.append(scopeBtn('agent', i18n.byAgent));
        $scope.append(scopeBtn('department', i18n.byDepartment));
        $app.append($scope);

        // Search + dept filter (only for agents)
        if (state.scope === 'agent') {
            var $bar = $('<div class="vc-search-bar"></div>');

            $bar.append('<input type="text" class="vc-search" placeholder="' +
                esc(i18n.search) + '" value="' + esc(state.search) + '">');

            // Department filter dropdown
            var deptOpts = '<option value="">' +
                esc(i18n.allDepartments || 'All departments') + '</option>';
            (D.departments || []).forEach(function(d) {
                var sel = (String(state.deptFilter) === String(d.id)) ? ' selected' : '';
                deptOpts += '<option value="' + d.id + '"' + sel + '>' +
                    esc(d.name) + '</option>';
            });
            $bar.append('<select class="vc-dept-filter" title="' +
                esc(i18n.filterByDepartment || 'Filter by department') + '">' +
                deptOpts + '</select>');

            // Result count
            var visible = countVisibleAgents();
            var total = (D.agents || []).length;
            $bar.append('<span class="vc-result-count">' +
                visible + ' / ' + total + '</span>');

            $app.append($bar);
        }

        // Matrix
        renderMatrix($app);

        // Save All button
        var dirtyCount = Object.keys(state.dirty).length;
        var $footer = $('<div class="vc-footer"></div>');
        $footer.append('<button class="vc-btn vc-btn-primary vc-save-all"' +
            (dirtyCount === 0 ? ' disabled' : '') + '>' +
            esc(i18n.saveAll) + (dirtyCount > 0 ? ' (' + dirtyCount + ')' : '') +
            '</button>');
        $app.append($footer);
    }

    function tabBtn(tabId, label) {
        var cls = 'vc-tab' + (state.tab === tabId ? ' active' : '');
        return '<button class="' + cls + '" data-tab="' + tabId + '">' + esc(label) + '</button>';
    }

    function scopeBtn(scopeId, label) {
        var cls = 'vc-scope-btn' + (state.scope === scopeId ? ' active' : '');
        return '<button class="' + cls + '" data-scope="' + scopeId + '">' + esc(label) + '</button>';
    }

    // ================================================================
    //  Matrix grid
    // ================================================================

    function renderMatrix($app) {
        var rows = getRows();
        var cols = getCols();

        if (rows.length === 0 || cols.length === 0) {
            $app.append('<div class="vc-empty">' + esc(i18n.noResults) + '</div>');
            return;
        }

        var $wrap = $('<div class="vc-matrix-wrap"></div>');
        var $table = $('<table class="vc-matrix"></table>');

        // Header row
        var $thead = $('<thead><tr></tr></thead>');
        var $hr = $thead.find('tr');
        $hr.append('<th class="vc-row-label">' + esc(state.scope === 'agent' ? i18n.agent : i18n.department) + '</th>');
        $hr.append('<th class="vc-row-status"></th>'); // restriction badge column
        cols.forEach(function(col) {
            var colLabel = col.name;
            if (col.state) colLabel += ' <span class="vc-state-badge">' + esc(col.state) + '</span>';
            $hr.append('<th class="vc-col-header" data-col="' + col.id + '">' +
                '<div class="vc-col-label">' + colLabel + '</div>' +
                '</th>');
        });
        $hr.append('<th class="vc-row-actions">' + esc(i18n.save) + '</th>');
        $table.append($thead);

        // Body rows
        var $tbody = $('<tbody></tbody>');
        var searchLower = state.search.toLowerCase();

        rows.forEach(function(row) {
            // Department filter (agent scope only)
            if (state.scope === 'agent' && state.deptFilter
                    && String(row.dept_id) !== String(state.deptFilter))
                return;

            // Search filter
            if (searchLower && row.name.toLowerCase().indexOf(searchLower) === -1
                    && (!row.dept_name || row.dept_name.toLowerCase().indexOf(searchLower) === -1))
                return;

            var allowed = getAllowedIds(state.tab, state.scope, row.id);
            var isRestricted = (allowed !== null);
            var ruleKey = getRuleKey(state.tab, state.scope, row.id);
            var isDirty = !!state.dirty[ruleKey];

            var $tr = $('<tr data-scope-id="' + row.id + '" class="' +
                (isRestricted ? 'vc-restricted' : 'vc-unrestricted') +
                (isDirty ? ' vc-dirty' : '') + '"></tr>');

            // Row label
            var label = esc(row.name);
            if (row.dept_name) label += '<span class="vc-dept-tag">' + esc(row.dept_name) + '</span>';
            $tr.append('<td class="vc-row-label">' + label + '</td>');

            // Restriction badge
            $tr.append('<td class="vc-row-status">' +
                '<span class="vc-badge ' + (isRestricted ? 'vc-badge-restricted' : 'vc-badge-unrestricted') + '">' +
                esc(isRestricted ? i18n.restricted : i18n.unrestricted) +
                '</span></td>');

            // Checkbox cells
            cols.forEach(function(col) {
                var isChecked = !isRestricted || allowed.indexOf(col.id) !== -1;
                // Skip self-transfer (same dept)
                var isSelf = (state.tab === 'transfer' && state.scope === 'department' && col.id === row.id);
                var $td = $('<td class="vc-cell"></td>');
                if (isSelf) {
                    $td.addClass('vc-cell-disabled').html('&mdash;');
                } else {
                    $td.append('<input type="checkbox" ' +
                        'data-scope-id="' + row.id + '" ' +
                        'data-target-id="' + col.id + '" ' +
                        (isChecked ? 'checked' : '') +
                        (!isRestricted ? ' class="vc-dimmed"' : '') +
                        '>');
                }
                $tr.append($td);
            });

            // Row actions
            var $actions = $('<td class="vc-row-actions"></td>');
            if (isRestricted) {
                $actions.append('<button class="vc-btn vc-btn-sm vc-btn-remove" data-scope-id="' +
                    row.id + '" title="' + esc(i18n.removeRestriction) + '">&#10005;</button>');
            }
            $actions.append('<button class="vc-btn vc-btn-sm vc-btn-save" data-scope-id="' +
                row.id + '"' + (!isDirty ? ' disabled' : '') + '>' + esc(i18n.save) + '</button>');
            $tr.append($actions);

            $tbody.append($tr);
        });

        $table.append($tbody);
        $wrap.append($table);
        $app.append($wrap);
    }

    function getRows() {
        if (state.scope === 'agent') return D.agents;
        return D.departments;
    }

    function getCols() {
        if (state.tab === 'status') return D.statuses;
        return D.departments;
    }

    // Re-render but preserve matrix scroll position (used after in-matrix
    // mutations like checkbox toggles, remove-restriction, save).
    function renderKeepScroll() {
        var $wrap = $('.vc-matrix-wrap');
        var sl = $wrap.length ? $wrap.scrollLeft() : 0;
        var st = $wrap.length ? $wrap.scrollTop() : 0;
        render();
        var $newWrap = $('.vc-matrix-wrap');
        if ($newWrap.length) {
            $newWrap.scrollLeft(sl);
            $newWrap.scrollTop(st);
        }
    }

    // Count agents matching current dept filter + search (used in result counter)
    function countVisibleAgents() {
        var searchLower = state.search.toLowerCase();
        var n = 0;
        (D.agents || []).forEach(function(a) {
            if (state.deptFilter
                    && String(a.dept_id) !== String(state.deptFilter)) return;
            if (searchLower
                    && a.name.toLowerCase().indexOf(searchLower) === -1
                    && (!a.dept_name || a.dept_name.toLowerCase().indexOf(searchLower) === -1))
                return;
            n++;
        });
        return n;
    }

    // ================================================================
    //  Event handlers
    // ================================================================

    $(document).on('click', '.vc-tab', function() {
        state.tab = $(this).data('tab');
        state.dirty = {};
        render();
    });

    $(document).on('click', '.vc-scope-btn', function() {
        state.scope = $(this).data('scope');
        state.search = '';
        state.deptFilter = '';
        state.dirty = {};
        render();
    });

    $(document).on('change', '.vc-dept-filter', function() {
        state.deptFilter = $(this).val();
        render();
    });

    $(document).on('input', '.vc-search', function() {
        state.search = $(this).val();
        // Update result counter
        var visible = countVisibleAgents();
        var total = (D.agents || []).length;
        $('.vc-result-count').text(visible + ' / ' + total);
        // Replace just the matrix wrapper to avoid losing focus on the search input
        $('.vc-matrix-wrap, .vc-empty').remove();
        renderMatrix($('#vc-app'));
        // Move appended matrix above the footer (Save All)
        $('.vc-footer').appendTo('#vc-app');
    });

    // Checkbox change
    $(document).on('change', '.vc-matrix input[type="checkbox"]', function() {
        var $cb = $(this);
        var scopeId = parseInt($cb.data('scope-id'), 10);
        var targetId = parseInt($cb.data('target-id'), 10);
        var cols = getCols();

        var allowed = getAllowedIds(state.tab, state.scope, scopeId);

        if (allowed === null) {
            // First click on unrestricted row: activate restriction with all checked
            var allIds = cols.map(function(c) { return c.id; });
            // For self-transfer, exclude self
            if (state.tab === 'transfer' && state.scope === 'department') {
                allIds = allIds.filter(function(id) { return id !== scopeId; });
            }

            if (!$cb.is(':checked')) {
                // User unchecked one — start with all except this one
                allIds = allIds.filter(function(id) { return id !== targetId; });
            }
            setAllowedIds(state.tab, state.scope, scopeId, allIds);
        } else {
            // Already restricted — toggle target
            if ($cb.is(':checked')) {
                if (allowed.indexOf(targetId) === -1)
                    allowed.push(targetId);
            } else {
                allowed = allowed.filter(function(id) { return id !== targetId; });
            }
            setAllowedIds(state.tab, state.scope, scopeId, allowed);
        }

        renderKeepScroll();
    });

    // Remove restriction
    $(document).on('click', '.vc-btn-remove', function(e) {
        e.stopPropagation();
        var scopeId = parseInt($(this).data('scope-id'), 10);
        setAllowedIds(state.tab, state.scope, scopeId, null);
        renderKeepScroll();
    });

    // Save single row
    $(document).on('click', '.vc-btn-save', function(e) {
        e.stopPropagation();
        var scopeId = parseInt($(this).data('scope-id'), 10);
        saveRow(state.tab, state.scope, scopeId, $(this));
    });

    // Save all
    $(document).on('click', '.vc-save-all', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).text(i18n.saving);

        var keys = Object.keys(state.dirty);
        var remaining = keys.length;
        var errors = [];

        if (remaining === 0) {
            $btn.text(i18n.saveAll);
            return;
        }

        keys.forEach(function(key) {
            var parts = key.split(':');
            var ruleType = parts[0];
            var scopeType = parts[1];
            var scopeId = parseInt(parts[2], 10);
            var allowed = getAllowedIds(ruleType, scopeType, scopeId);

            $.ajax({
                url: D.ajaxBase + '/rules/save',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    rule_type: ruleType,
                    scope_type: scopeType,
                    scope_id: scopeId,
                    target_ids: allowed || [],
                    restricted: allowed !== null
                }),
                success: function() {
                    delete state.dirty[key];
                },
                error: function(xhr) {
                    var msg = 'Save failed';
                    try { msg = JSON.parse(xhr.responseText).error || msg; } catch(ex) {}
                    errors.push(scopeType + ' ' + scopeId + ': ' + msg);
                },
                complete: function() {
                    remaining--;
                    if (remaining === 0) {
                        if (errors.length) {
                            showToast(i18n.error + ': ' + errors.join('; '), 'error');
                        } else {
                            showToast(i18n.saved, 'success');
                        }
                        renderKeepScroll();
                    }
                }
            });
        });
    });

    // ================================================================
    //  Save helper
    // ================================================================

    function saveRow(ruleType, scopeType, scopeId, $btn) {
        var allowed = getAllowedIds(ruleType, scopeType, scopeId);
        $btn.prop('disabled', true).text(i18n.saving);

        $.ajax({
            url: D.ajaxBase + '/rules/save',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                rule_type: ruleType,
                scope_type: scopeType,
                scope_id: scopeId,
                target_ids: allowed || [],
                restricted: allowed !== null
            }),
            success: function() {
                var key = getRuleKey(ruleType, scopeType, scopeId);
                delete state.dirty[key];
                showToast(i18n.saved, 'success');
                renderKeepScroll();
            },
            error: function(xhr) {
                var msg = 'Save failed';
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch(ex) {}
                showToast(msg, 'error');
                $btn.prop('disabled', false).text(i18n.save);
            }
        });
    }

    // ================================================================
    //  Toast notification
    // ================================================================

    function showToast(msg, type) {
        var $toast = $('<div class="vc-toast vc-toast-' + (type || 'info') + '">' + esc(msg) + '</div>');
        $('body').append($toast);
        setTimeout(function() { $toast.addClass('vc-toast-visible'); }, 10);
        setTimeout(function() {
            $toast.removeClass('vc-toast-visible');
            setTimeout(function() { $toast.remove(); }, 300);
        }, 3000);
    }

    // ================================================================
    //  Util
    // ================================================================

    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    }

    // ================================================================
    //  Updates tab
    // ================================================================

    var updateData = null;

    function renderUpdatesTab($app) {
        var $wrap = $('<div class="vc-updates-wrap"></div>');
        $wrap.append('<div id="vc-update-panel"></div>');
        $app.append($wrap);

        if (updateData) {
            renderUpdatePanel(updateData);
        } else {
            $('#vc-update-panel').html(
                '<div class="vc-up-loading"><span class="vc-up-spinner"></span> ' +
                esc(i18n.checkingUpdates || 'Checking for updates...') + '</div>'
            );
            $.ajax({
                url: D.ajaxBase + '/update/check',
                type: 'GET',
                dataType: 'json',
                success: function(data) {
                    updateData = data;
                    renderUpdatePanel(data);
                },
                error: function() {
                    $('#vc-update-panel').html(
                        '<div class="vc-up-error-msg"><strong>' + esc(i18n.error) +
                        ':</strong> Could not check for updates.</div>'
                    );
                }
            });
        }
    }

    function renderUpdatePanel(data) {
        var $panel = $('#vc-update-panel');
        var hasMinor = data.minor && data.minor.version;
        var hasMajor = data.major && data.major.version;

        var html = '<div class="vc-up-header">' +
            '<span class="vc-up-title">' + esc(i18n.updates || 'Updates') + '</span>' +
            '<span class="vc-up-version">Installed: <strong>v' + esc(data.local) + '</strong></span>' +
            '<button class="vc-btn vc-btn-sm vc-up-refresh" title="' +
            esc(i18n.refreshUpdates || 'Refresh') + '">&#8635;</button>' +
            '</div>';

        if (!hasMinor && !hasMajor && !data.error) {
            html += '<div class="vc-up-body">' +
                '<div class="vc-up-ok">&#10003; You are running the latest version.</div></div>';
            $panel.html(html);
            return;
        }

        if (data.error && !hasMinor && !hasMajor) {
            html += '<div class="vc-up-body">' +
                '<div class="vc-up-error-msg">&#9888; ' + esc(data.error) + '</div></div>';
            $panel.html(html);
            return;
        }

        html += '<div class="vc-up-body">';
        if (hasMinor) html += buildUpdateCard('minor', data.minor, data.local);
        if (hasMajor) html += buildUpdateCard('major', data.major, data.local);
        html += '</div>';

        $panel.html(html);
    }

    function buildUpdateCard(type, update, local) {
        var isMajor = (type === 'major');
        var label = isMajor ? 'Major Update' : 'Minor / Patch Update';
        var cls = isMajor ? 'vc-up-card vc-up-card-major' : 'vc-up-card vc-up-card-minor';

        var h = '<div class="' + cls + '">' +
            '<div class="vc-up-card-header">' +
            '<span class="vc-up-card-label">' + label + '</span>' +
            '</div>' +
            '<div class="vc-up-card-body">' +
            '<div class="vc-up-version-jump">' +
            'v' + esc(local) + ' <span class="vc-up-arrow">&rarr;</span> <strong>v' +
            esc(update.version) + '</strong></div>';

        if (isMajor) {
            h += '<div class="vc-up-card-warning">&#9888; Major version — may contain breaking changes. ' +
                'Review the release notes before installing.</div>';
        }

        if (update.body) {
            h += '<a href="#" class="vc-up-toggle-notes">Show release notes</a>' +
                '<div class="vc-up-notes" style="display:none;">' +
                formatReleaseBody(update.body) + '</div>';
        }

        h += '<button class="vc-btn ' + (isMajor ? 'vc-up-btn-major' : 'vc-up-btn-minor') +
            ' vc-up-install-btn" data-tag="' + esc(update.tag) +
            '" data-version="' + esc(update.version) +
            '" data-type="' + type + '">Install ' + label + '</button>' +
            '</div></div>';
        return h;
    }

    function formatReleaseBody(text) {
        text = esc(text);
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/^#{2,3}\s+(.+)$/gm, '<strong>$1</strong>');
        text = text.replace(/^[\-\*]\s+(.+)$/gm, '<span class="vc-up-bullet">&bull; $1</span>');
        text = text.replace(/\n/g, '<br>');
        return text;
    }

    // Updates tab events
    $(document).on('click', '.vc-up-refresh', function() {
        updateData = null;
        render();
    });

    $(document).on('click', '.vc-up-toggle-notes', function(e) {
        e.preventDefault();
        var $notes = $(this).closest('.vc-up-card').find('.vc-up-notes');
        $notes.slideToggle(200);
        $(this).text($notes.is(':visible') ? 'Hide release notes' : 'Show release notes');
    });

    $(document).on('click', '.vc-up-install-btn', function(e) {
        e.preventDefault();
        var $btn = $(this);
        var tag = $btn.data('tag');
        var version = $btn.data('version');
        var type = $btn.data('type');
        var typeLabel = (type === 'major') ? 'MAJOR' : 'minor';
        var warning = (type === 'major')
            ? '\n\nWARNING: This is a MAJOR update and may contain breaking changes!' : '';

        if (!confirm(
            'Install Visibility Control v' + version + ' (' + typeLabel + ')?' + warning + '\n\n' +
            'This will:\n' +
            '  \u2022 Back up current plugin files\n' +
            '  \u2022 Back up plugin database config + rules\n' +
            '  \u2022 Download and install v' + version + ' from GitHub\n\n' +
            'Current version: v' + (updateData ? updateData.local : '?')
        )) return;

        $('#vc-update-panel .vc-up-body').html(
            '<div class="vc-up-loading"><span class="vc-up-spinner"></span> ' +
            'Installing v' + esc(version) + '&hellip; please wait</div>'
        );

        $.ajax({
            url: D.ajaxBase + '/update/install',
            type: 'POST',
            data: { tag: tag },
            dataType: 'json',
            success: function(data) {
                if (data.success) {
                    updateData = null;
                    $('#vc-update-panel .vc-up-body').html(
                        '<div class="vc-up-ok">&#10003; <strong>Updated to v' +
                        esc(data.new_version) + '!</strong> Backups saved.' +
                        (data.backup_files ? ' Files: <code>' + esc(data.backup_files) + '</code>' : '') +
                        (data.backup_db ? ' DB: <code>' + esc(data.backup_db) + '</code>' : '') +
                        '</div>'
                    );
                } else {
                    $('#vc-update-panel .vc-up-body').html(
                        '<div class="vc-up-error-msg">&#9888; <strong>Update failed:</strong> ' +
                        esc(data.error || 'Unknown error') +
                        (data.rollback ? '<br><strong>Rollback:</strong> ' + esc(data.rollback) : '') +
                        '</div>'
                    );
                }
            },
            error: function(xhr) {
                var msg = 'Server error during update.';
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch(ex) {}
                $('#vc-update-panel .vc-up-body').html(
                    '<div class="vc-up-error-msg">&#9888; <strong>Update failed:</strong> ' +
                    esc(msg) + '</div>'
                );
            }
        });
    });

    // ================================================================
    //  Init
    // ================================================================

    $(function() {
        // Jump to updates tab if URL has #updates
        if (window.location.hash === '#updates') state.tab = 'updates';
        render();
    });

})(jQuery);
