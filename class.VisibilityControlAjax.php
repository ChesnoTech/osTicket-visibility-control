<?php
/**
 * Visibility Control Plugin — AJAX Controller
 *
 * Handles admin page, rules CRUD, validation endpoints,
 * static asset serving, and auto-update endpoints.
 *
 * @author  ChesnoTech
 * @version 1.1.0
 */

require_once INCLUDE_DIR . 'class.ajax.php';

class VisibilityControlAjax extends AjaxController {

    private static $pluginCache = null;

    // ================================================================
    //  Helpers
    // ================================================================

    private static function findPlugin() {
        if (self::$pluginCache === null)
            self::$pluginCache = Plugin::objects()->findFirst(
                array('install_path' => 'plugins/visibility-control'));
        return self::$pluginCache;
    }

    private function requireStaff() {
        global $thisstaff;
        if (!$thisstaff || !$thisstaff->isValid())
            Http::response(403, __('Access Denied'));
        return $thisstaff;
    }

    private function requireAdmin() {
        $staff = $this->requireStaff();
        if (!$staff->isAdmin())
            Http::response(403, __('Admin access required'));
        return $staff;
    }

    private function getCsrfToken() {
        global $ost;
        if ($ost && $ost->getCSRF())
            return $ost->getCSRF()->getToken();
        return '';
    }

    private function serveFile($file, $contentType, $maxAge = 86400) {
        if (!file_exists($file))
            Http::response(404, 'Not found');

        $etag = '"vc-' . md5($file) . '-' . filemtime($file) . '"';
        header('Content-Type: ' . $contentType);
        header('Cache-Control: public, max-age=' . $maxAge);
        header('ETag: ' . $etag);
        if (isset($_SERVER['HTTP_IF_NONE_MATCH'])
                && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
            Http::response(304, '');
            exit;
        }
        readfile($file);
        exit;
    }

    // ================================================================
    //  Asset serving
    // ================================================================

    function serveJs() {
        $this->serveFile(dirname(__FILE__) . '/assets/visibility-control.js',
            'application/javascript; charset=UTF-8');
    }

    function serveCss() {
        $this->serveFile(dirname(__FILE__) . '/assets/visibility-control.css',
            'text/css; charset=UTF-8', 0);
    }

    function serveAdminJs() {
        $this->serveFile(dirname(__FILE__) . '/assets/visibility-control-admin.js',
            'application/javascript; charset=UTF-8', 3600);
    }

    function serveAdminCss() {
        $this->serveFile(dirname(__FILE__) . '/assets/visibility-control-admin.css',
            'text/css; charset=UTF-8', 3600);
    }


    // ================================================================
    //  Data endpoints (admin)
    // ================================================================

    function getAgents() {
        $this->requireAdmin();
        $prefix = TABLE_PREFIX;
        $agents = array();
        $res = db_query(
            "SELECT s.staff_id, CONCAT(s.firstname, ' ', s.lastname) AS name,
                    s.dept_id, d.name AS dept_name
             FROM {$prefix}staff s
             LEFT JOIN {$prefix}department d ON d.id = s.dept_id
             WHERE s.isactive = 1
             ORDER BY s.lastname, s.firstname"
        );
        while ($row = db_fetch_array($res)) {
            $agents[] = array(
                'id'       => (int) $row['staff_id'],
                'name'     => $row['name'],
                'dept_id'  => (int) $row['dept_id'],
                'dept_name'=> $row['dept_name'] ?: '',
            );
        }
        return $this->json_encode($agents);
    }

    function getDepartments() {
        $this->requireAdmin();
        $depts = array();
        foreach (Dept::getDepartments() as $id => $name)
            $depts[] = array('id' => (int) $id, 'name' => $name);
        return $this->json_encode($depts);
    }

    function getStatuses() {
        $this->requireAdmin();
        $statuses = array();
        if ($items = TicketStatusList::getStatuses(array('enabled' => true))) {
            foreach ($items as $s) {
                $state = $s->getState();
                $statuses[] = array(
                    'id'    => (int) $s->getId(),
                    'name'  => $s->getName(),
                    'state' => $state ? ucfirst($state) : 'Custom',
                );
            }
        }
        return $this->json_encode($statuses);
    }

    // ================================================================
    //  Rules CRUD (admin)
    // ================================================================

    function getRules() {
        $this->requireAdmin();
        $prefix = TABLE_PREFIX;

        $rules = array();
        $res = db_query(
            "SELECT rule_type, scope_type, scope_id, target_id
             FROM `{$prefix}visibility_control_rules`
             ORDER BY rule_type, scope_type, scope_id"
        );
        while ($row = db_fetch_array($res)) {
            $key = $row['rule_type'] . ':' . $row['scope_type'] . ':' . $row['scope_id'];
            if (!isset($rules[$key])) {
                $rules[$key] = array(
                    'rule_type'  => $row['rule_type'],
                    'scope_type' => $row['scope_type'],
                    'scope_id'   => (int) $row['scope_id'],
                    'target_ids' => array(),
                );
            }
            $tid = (int) $row['target_id'];
            // target_id = 0 is the deny-all sentinel; keep the rule entry but skip ID
            if ($tid > 0)
                $rules[$key]['target_ids'][] = $tid;
        }

        return $this->json_encode(array_values($rules));
    }

    function saveRules() {
        $this->requireAdmin();
        $prefix = TABLE_PREFIX;

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input))
            return $this->json_encode(array('error' => 'Invalid JSON'));

        $ruleType = $input['rule_type'] ?? '';
        $scopeType = $input['scope_type'] ?? '';
        $scopeId = (int) ($input['scope_id'] ?? 0);
        $targetIds = $input['target_ids'] ?? array();
        // Explicit restriction flag — distinguishes "deny-all" (restricted, empty list)
        // from "remove restriction" (unrestricted, no rule)
        $restricted = isset($input['restricted'])
            ? (bool) $input['restricted']
            : !empty($targetIds);

        if (!in_array($ruleType, array('status', 'transfer')))
            return $this->json_encode(array('error' => 'Invalid rule_type'));
        if (!in_array($scopeType, array('agent', 'department')))
            return $this->json_encode(array('error' => 'Invalid scope_type'));
        if ($scopeId <= 0)
            return $this->json_encode(array('error' => 'Invalid scope_id'));
        if (!is_array($targetIds))
            return $this->json_encode(array('error' => 'target_ids must be an array'));

        // Delete existing rules for this combo
        db_query(sprintf(
            "DELETE FROM `{$prefix}visibility_control_rules`
             WHERE rule_type = %s AND scope_type = %s AND scope_id = %d",
            db_input($ruleType), db_input($scopeType), $scopeId
        ));

        if ($restricted) {
            // Filter and dedupe valid target IDs
            $valid = array();
            foreach ($targetIds as $tid) {
                $tid = (int) $tid;
                if ($tid > 0) $valid[$tid] = true;
            }

            if (empty($valid)) {
                // Deny-all sentinel: restricted with zero allowed targets
                db_query(sprintf(
                    "INSERT INTO `{$prefix}visibility_control_rules`
                     (rule_type, scope_type, scope_id, target_id, created, updated)
                     VALUES (%s, %s, %d, 0, NOW(), NOW())",
                    db_input($ruleType), db_input($scopeType), $scopeId
                ));
            } else {
                foreach (array_keys($valid) as $tid) {
                    db_query(sprintf(
                        "INSERT INTO `{$prefix}visibility_control_rules`
                         (rule_type, scope_type, scope_id, target_id, created, updated)
                         VALUES (%s, %s, %d, %d, NOW(), NOW())
                         ON DUPLICATE KEY UPDATE updated = NOW()",
                        db_input($ruleType), db_input($scopeType), $scopeId, $tid
                    ));
                }
            }
        }
        // else: unrestricted — no rows inserted

        return $this->json_encode(array('success' => true));
    }

    // ================================================================
    //  Validation endpoints (all staff)
    // ================================================================

    function validateStatus() {
        $staff = $this->requireStaff();
        $input = json_decode(file_get_contents('php://input'), true);
        $statusId = (int) ($input['status_id'] ?? 0);

        if (!$statusId)
            Http::response(400, json_encode(array('error' => 'Missing status_id')));

        $rules = VisibilityControlPlugin::getAgentRules(
            $staff->getId(), $staff->getDeptId()
        );

        if ($rules['hasStatusRestriction']
                && !in_array($statusId, $rules['statuses'])) {
            Http::response(403, json_encode(array(
                'error' => __('You are not allowed to use this status.')
            )));
        }

        return $this->json_encode(array('allowed' => true));
    }

    function validateTransfer() {
        $staff = $this->requireStaff();
        $input = json_decode(file_get_contents('php://input'), true);
        $deptId = (int) ($input['dept_id'] ?? 0);

        if (!$deptId)
            Http::response(400, json_encode(array('error' => 'Missing dept_id')));

        $rules = VisibilityControlPlugin::getAgentRules(
            $staff->getId(), $staff->getDeptId()
        );

        if ($rules['hasTransferRestriction']
                && !in_array($deptId, $rules['transfers'])) {
            Http::response(403, json_encode(array(
                'error' => __('You are not allowed to transfer to this department.')
            )));
        }

        return $this->json_encode(array('allowed' => true));
    }

    // ================================================================
    //  Auto-update endpoints (admin only)
    // ================================================================

    function checkUpdate() {
        $this->requireAdmin();

        require_once dirname(__FILE__) . '/class.VisibilityControlUpdater.php';
        $result = VisibilityControlUpdater::checkUpdate();
        Http::response(200, JsonDataEncoder::encode($result));
    }

    function installUpdate() {
        $this->requireAdmin();

        $tag = isset($_POST['tag']) ? trim($_POST['tag']) : '';

        // Validate tag format
        if ($tag && !preg_match('/^v?\d+\.\d+\.\d+$/', $tag)) {
            Http::response(400, JsonDataEncoder::encode(
                array('error' => /* trans */ 'Invalid version tag format')));
            return;
        }

        require_once dirname(__FILE__) . '/class.VisibilityControlUpdater.php';
        $result = VisibilityControlUpdater::downloadAndInstall($tag);

        if ($result['success']) {
            $result['new_version'] = VisibilityControlUpdater::getLocalVersion();
        }

        Http::response($result['success'] ? 200 : 500, JsonDataEncoder::encode($result));
    }

    // ================================================================
    //  Admin Page (full-page standalone HTML)
    // ================================================================

    function serveAdminPage() {
        $this->requireAdmin();

        $prefix = TABLE_PREFIX;

        // Gather data
        $agents = array();
        $res = db_query(
            "SELECT s.staff_id, CONCAT(s.firstname, ' ', s.lastname) AS name,
                    s.dept_id, d.name AS dept_name
             FROM {$prefix}staff s
             LEFT JOIN {$prefix}department d ON d.id = s.dept_id
             WHERE s.isactive = 1
             ORDER BY s.lastname, s.firstname"
        );
        while ($row = db_fetch_array($res)) {
            $agents[] = array(
                'id'       => (int) $row['staff_id'],
                'name'     => $row['name'],
                'dept_id'  => (int) $row['dept_id'],
                'dept_name'=> $row['dept_name'] ?: '',
            );
        }

        $departments = array();
        foreach (Dept::getDepartments() as $id => $name)
            $departments[] = array('id' => (int) $id, 'name' => $name);

        $statuses = array();
        if ($items = TicketStatusList::getStatuses(array('enabled' => true))) {
            foreach ($items as $s) {
                $state = $s->getState();
                $statuses[] = array(
                    'id'    => (int) $s->getId(),
                    'name'  => $s->getName(),
                    'state' => $state ? ucfirst($state) : 'Custom',
                );
            }
        }

        // Current rules
        $rules = array();
        $res2 = db_query(
            "SELECT rule_type, scope_type, scope_id, target_id
             FROM `{$prefix}visibility_control_rules`
             ORDER BY rule_type, scope_type, scope_id"
        );
        while ($row = db_fetch_array($res2)) {
            $key = $row['rule_type'] . ':' . $row['scope_type'] . ':' . $row['scope_id'];
            if (!isset($rules[$key])) {
                $rules[$key] = array(
                    'rule_type'  => $row['rule_type'],
                    'scope_type' => $row['scope_type'],
                    'scope_id'   => (int) $row['scope_id'],
                    'target_ids' => array(),
                );
            }
            $tid = (int) $row['target_id'];
            // Skip deny-all sentinel (target_id=0); rule entry still exists
            if ($tid > 0)
                $rules[$key]['target_ids'][] = $tid;
        }

        $data = array(
            'agents'      => $agents,
            'departments' => $departments,
            'statuses'    => $statuses,
            'rules'       => array_values($rules),
            'csrfToken'   => $this->getCsrfToken(),
            'ajaxBase'    => ROOT_PATH . 'scp/ajax.php/visibility-control',
            'i18n'        => array(
                'title'              => __('Visibility Control'),
                'statusRules'        => __('Status Rules'),
                'transferRules'      => __('Transfer Rules'),
                'byAgent'            => __('By Agent'),
                'byDepartment'       => __('By Department'),
                'agent'              => __('Agent'),
                'department'         => __('Department'),
                'status'             => __('Status'),
                'unrestricted'       => __('Unrestricted'),
                'restricted'         => __('Restricted'),
                'selectAll'          => __('Select All'),
                'clearAll'           => __('Clear All'),
                'removeRestriction'  => __('Remove Restriction'),
                'save'               => __('Save'),
                'saveAll'            => __('Save All'),
                'saved'              => __('Saved'),
                'saving'             => __('Saving...'),
                'error'              => __('Error'),
                'search'             => __('Search...'),
                'noResults'          => __('No results'),
                'allDepartments'     => __('All departments'),
                'filterByDepartment' => __('Filter by department'),
                'confirmRestrict'    => __('This will restrict this entry. Only checked items will be allowed. Continue?'),
                'confirmRemove'      => __('Remove all restrictions? This entry will become unrestricted.'),
                'updates'            => __('Updates'),
                'checkingUpdates'    => __('Checking for updates...'),
                'refreshUpdates'     => __('Refresh'),
            ),
        );

        header('Content-Type: text/html; charset=utf-8');
        $this->renderAdminHtml($data);
        exit;
    }

    private function renderAdminHtml($data) {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        $assetBase = ROOT_PATH . 'scp/ajax.php/visibility-control/assets';
        $dir = dirname(__FILE__) . '/assets/';
        $v = max(
            @filemtime($dir . 'visibility-control-admin.js'),
            @filemtime($dir . 'visibility-control-admin.css')
        ) ?: time();

        echo '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>' . htmlspecialchars($data['i18n']['title']) . '</title>
<link rel="stylesheet" href="' . $assetBase . '/admin-css?v=' . $v . '">
</head>
<body>
<div id="vc-app"></div>
<script>var VC_DATA = ' . $json . ';</script>
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="' . $assetBase . '/admin-js?v=' . $v . '"></script>
</body>
</html>';
    }
}
