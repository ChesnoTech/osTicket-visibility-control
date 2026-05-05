(function($) {
    'use strict';

    var rules = window.VC_RULES || {};
    var ajaxBase = $('head script[src*="visibility-control"]').attr('src');
    if (ajaxBase) {
        ajaxBase = ajaxBase.replace(/\/assets\/.*$/, '');
    } else {
        // Fallback: derive from any existing ajax.php reference
        var m = $('script[src*="scp/ajax.php"]').first().attr('src');
        ajaxBase = (m ? m.replace(/\/[^/]+\/assets.*$/, '') : '/scp/ajax.php') + '/visibility-control';
    }

    // Exit early if no restrictions
    if (!rules.hasStatusRestriction && !rules.hasTransferRestriction)
        return;

    // ================================================================
    //  Status dropdown filtering (#action-dropdown-statuses)
    // ================================================================

    function filterStatusDropdown() {
        if (!rules.hasStatusRestriction) return;

        var allowed = rules.statuses || [];
        $('#action-dropdown-statuses ul li').each(function() {
            var $li = $(this);
            var $a = $li.find('a').first();
            var href = $a.attr('href') || '';

            // Parse status ID from href like "#tickets/123/status/close/5"
            var match = href.match(/\/status\/\w+\/(\d+)$/);
            if (!match) return;

            var statusId = parseInt(match[1], 10);
            if (allowed.indexOf(statusId) === -1) {
                $li.addClass('vc-hidden');
            } else {
                $li.removeClass('vc-hidden');
            }
        });

        // If all items hidden, hide the entire dropdown trigger
        var $dropdown = $('#action-dropdown-statuses');
        var $trigger = $('[data-dropdown="#action-dropdown-statuses"]');
        var visibleCount = $dropdown.find('ul li').not('.vc-hidden').length;
        if (visibleCount === 0) {
            $trigger.addClass('vc-hidden');
        } else {
            $trigger.removeClass('vc-hidden');
        }
    }

    // ================================================================
    //  Status modal filtering (select[name="status_id"])
    // ================================================================

    function filterStatusModal(container) {
        if (!rules.hasStatusRestriction) return;

        var allowed = rules.statuses || [];
        var $select = $(container).find('select[name="status_id"]');
        if (!$select.length) return;

        $select.find('option').each(function() {
            var val = parseInt($(this).val(), 10);
            if (val && allowed.indexOf(val) === -1) {
                $(this).remove();
            }
        });

        // If only one option left, auto-select it
        if ($select.find('option').length === 1) {
            $select.find('option').first().prop('selected', true);
        }
        // If no options left, show error
        if ($select.find('option').length === 0) {
            $select.closest('tbody').before(
                '<tr><td colspan="2"><p id="msg_error">' +
                'No statuses available for your account.</p></td></tr>'
            );
        }
    }

    // ================================================================
    //  Transfer modal filtering (form#transfer select)
    // ================================================================

    function filterTransferModal(container) {
        if (!rules.hasTransferRestriction) return;

        var allowed = rules.transfers || [];
        // The department select is the first (and only) <select> in the transfer form
        var $select = $(container).find('form#transfer select, form.mass-action select').first();
        if (!$select.length) return;

        $select.find('option').each(function() {
            var val = parseInt($(this).val(), 10);
            if (val && allowed.indexOf(val) === -1) {
                $(this).remove();
            }
        });

        if ($select.find('option').length === 0) {
            $select.before(
                '<p id="msg_error">No departments available for transfer.</p>'
            );
        }
    }

    // ================================================================
    //  MutationObserver for AJAX-loaded dialogs
    // ================================================================

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
                var node = mutation.addedNodes[i];
                if (node.nodeType !== 1) continue;

                var $node = $(node);

                // Status change modal
                if ($node.find('select[name="status_id"]').length) {
                    filterStatusModal(node);
                }
                // Also check if the node IS the form container
                if ($node.is('#ticket-status') || $node.find('#ticket-status').length) {
                    filterStatusModal(node);
                }

                // Transfer modal
                if ($node.find('form#transfer').length || $node.is('form#transfer')) {
                    filterTransferModal(node);
                }
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ================================================================
    //  Form submission interception (server-side validation)
    // ================================================================

    function getCSRFToken() {
        return $('meta[name="csrf_token"]').attr('content') || '';
    }

    $(document).on('submit', 'form#status', function(e) {
        if (!rules.hasStatusRestriction) return;

        var $form = $(this);
        if ($form.data('vc-validated')) {
            $form.removeData('vc-validated');
            return; // Allow through
        }

        e.preventDefault();
        var statusId = parseInt($form.find('select[name="status_id"]').val()
                        || $form.find('input[name="status_id"]').val(), 10);
        if (!statusId) return;

        var $submit = $form.find('input[type="submit"]');
        $submit.prop('disabled', true).val('Validating...');

        $.ajax({
            url: ajaxBase + '/validate/status',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ status_id: statusId }),
            headers: { 'X-CSRFToken': getCSRFToken() },
            success: function() {
                $form.data('vc-validated', true);
                $submit.prop('disabled', false);
                $form.submit();
            },
            error: function(xhr) {
                $submit.prop('disabled', false).val('Submit');
                var msg = 'Status change not allowed.';
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch(ex) {}
                alert(msg);
            }
        });
    });

    $(document).on('submit', 'form#transfer, form.mass-action[action*="transfer"]', function(e) {
        if (!rules.hasTransferRestriction) return;

        var $form = $(this);
        if ($form.data('vc-validated')) {
            $form.removeData('vc-validated');
            return;
        }

        // Find the department select (first select in the transfer form)
        var $select = $form.find('select').first();
        var deptId = parseInt($select.val(), 10);
        if (!deptId) return;

        e.preventDefault();
        var $submit = $form.find('input[type="submit"]');
        $submit.prop('disabled', true).val('Validating...');

        $.ajax({
            url: ajaxBase + '/validate/transfer',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ dept_id: deptId }),
            headers: { 'X-CSRFToken': getCSRFToken() },
            success: function() {
                $form.data('vc-validated', true);
                $submit.prop('disabled', false);
                $form.submit();
            },
            error: function(xhr) {
                $submit.prop('disabled', false).val('Transfer');
                var msg = 'Transfer not allowed.';
                try { msg = JSON.parse(xhr.responseText).error || msg; } catch(ex) {}
                alert(msg);
            }
        });
    });

    // ================================================================
    //  Initial run & PJAX support
    // ================================================================

    $(document).ready(filterStatusDropdown);
    $(document).on('pjax:end', function() {
        setTimeout(filterStatusDropdown, 100);
    });

})(jQuery);
