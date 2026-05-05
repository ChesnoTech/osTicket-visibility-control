<?php
/**
 * Visibility Control Plugin — Main Class
 *
 * Controls which ticket statuses each agent/department can see and use,
 * and which departments they can transfer tickets to.
 *
 * @author  ChesnoTech
 * @version 1.1.0
 */

require_once dirname(__FILE__) . '/config.php';

class VisibilityControlPlugin extends Plugin {

    var $config_class = 'VisibilityControlConfig';

    static private $bootstrapped = false;

    function isMultiInstance() {
        return false;
    }

    function bootstrap() {
        self::bootstrapStatic();
    }

    /**
     * Called by osTicket when the installed version differs from the manifest.
     * Back up DB config before the version bump is applied.
     */
    function pre_upgrade(&$errors) {
        require_once dirname(__FILE__) . '/class.VisibilityControlUpdater.php';
        $backup = VisibilityControlUpdater::backupDatabase();
        if (!$backup['success']) {
            $errors[] = 'Visibility Control: DB backup failed — '
                      . ($backup['error'] ?? 'unknown error');
            return false;
        }
        return true;
    }

    // ================================================================
    //  Static bootstrap & hooks
    // ================================================================

    static function bootstrapStatic() {
        if (self::$bootstrapped)
            return;
        self::$bootstrapped = true;

        if (!defined('STAFFINC_DIR'))
            return;

        VisibilityControlConfig::ensureTable();
        Signal::connect('ajax.scp', array('VisibilityControlPlugin', 'registerAjaxRoutes'));
        ob_start(array('VisibilityControlPlugin', 'injectAssets'));
    }

    static function registerAjaxRoutes($dispatcher) {
        $dir = INCLUDE_DIR . 'plugins/visibility-control/';
        $dispatcher->append(
            url('^/visibility-control/', patterns(
                $dir . 'class.VisibilityControlAjax.php:VisibilityControlAjax',
                url_get('^admin$', 'serveAdminPage'),
                url_get('^rules$', 'getRules'),
                url_post('^rules/save$', 'saveRules'),
                url_get('^agents$', 'getAgents'),
                url_get('^departments$', 'getDepartments'),
                url_get('^statuses$', 'getStatuses'),
                url_post('^validate/status$', 'validateStatus'),
                url_post('^validate/transfer$', 'validateTransfer'),
                url_get('^update/check$', 'checkUpdate'),
                url_post('^update/install$', 'installUpdate'),
                url_get('^assets/js$', 'serveJs'),
                url_get('^assets/css$', 'serveCss'),
                url_get('^assets/admin-js$', 'serveAdminJs'),
                url_get('^assets/admin-css$', 'serveAdminCss')
            ))
        );
    }

    // ================================================================
    //  Rule resolution
    // ================================================================

    /**
     * Resolve the effective visibility rules for a given agent.
     * Agent-level rules take precedence over department-level rules.
     *
     * @param  int $staffId  Staff ID
     * @param  int $deptId   Primary department ID
     * @return array {statuses, transfers, hasStatusRestriction, hasTransferRestriction}
     */
    static function getAgentRules($staffId, $deptId) {
        $prefix = TABLE_PREFIX;
        $staffId = (int) $staffId;
        $deptId = (int) $deptId;

        $result = array(
            'statuses' => null,
            'transfers' => null,
            'hasStatusRestriction' => false,
            'hasTransferRestriction' => false,
        );

        if (!$staffId)
            return $result;

        $sql = "SELECT rule_type, scope_type, target_id
                FROM `{$prefix}visibility_control_rules`
                WHERE (scope_type = 'agent' AND scope_id = {$staffId})";
        if ($deptId)
            $sql .= " OR (scope_type = 'department' AND scope_id = {$deptId})";
        $sql .= " ORDER BY scope_type ASC";

        $res = db_query($sql);
        if (!$res)
            return $result;

        $agentStatuses = array();
        $agentTransfers = array();
        $deptStatuses = array();
        $deptTransfers = array();
        $hasAgentStatus = false;
        $hasAgentTransfer = false;
        $hasDeptStatus = false;
        $hasDeptTransfer = false;

        while ($row = db_fetch_array($res)) {
            $scope = $row['scope_type'];
            $type = $row['rule_type'];
            $tid = (int) $row['target_id'];

            // target_id = 0 is the deny-all sentinel: marks restriction
            // exists but with zero allowed targets. Skip adding 0 to the
            // allow list, but still flag the restriction as active.
            if ($scope === 'agent' && $type === 'status') {
                $hasAgentStatus = true;
                if ($tid > 0) $agentStatuses[] = $tid;
            } elseif ($scope === 'agent' && $type === 'transfer') {
                $hasAgentTransfer = true;
                if ($tid > 0) $agentTransfers[] = $tid;
            } elseif ($scope === 'department' && $type === 'status') {
                $hasDeptStatus = true;
                if ($tid > 0) $deptStatuses[] = $tid;
            } elseif ($scope === 'department' && $type === 'transfer') {
                $hasDeptTransfer = true;
                if ($tid > 0) $deptTransfers[] = $tid;
            }
        }

        // Agent-level overrides department-level
        if ($hasAgentStatus) {
            $result['statuses'] = $agentStatuses;
            $result['hasStatusRestriction'] = true;
        } elseif ($hasDeptStatus) {
            $result['statuses'] = $deptStatuses;
            $result['hasStatusRestriction'] = true;
        }

        if ($hasAgentTransfer) {
            $result['transfers'] = $agentTransfers;
            $result['hasTransferRestriction'] = true;
        } elseif ($hasDeptTransfer) {
            $result['transfers'] = $deptTransfers;
            $result['hasTransferRestriction'] = true;
        }

        return $result;
    }

    // ================================================================
    //  Asset injection via output buffer
    // ================================================================

    static function injectAssets($buffer) {
        if (!empty($_SERVER['HTTP_X_PJAX']))
            return $buffer;

        if (strpos($buffer, '</head>') === false
                || strpos($buffer, '</body>') === false)
            return $buffer;

        global $thisstaff;

        $base = ROOT_PATH . 'scp/ajax.php/visibility-control/assets';
        $dir = dirname(__FILE__) . '/assets/';
        $v = max(
            @filemtime($dir . 'visibility-control.js'),
            @filemtime($dir . 'visibility-control.css')
        ) ?: time();

        // Inject rules JSON for current agent
        $rulesJson = '{}';
        if ($thisstaff && $thisstaff->getId()) {
            $rules = self::getAgentRules(
                $thisstaff->getId(),
                $thisstaff->getDeptId()
            );
            $rulesJson = json_encode($rules);
        }
        $rulesScript = sprintf(
            '<script type="text/javascript">window.VC_RULES=%s;</script>',
            $rulesJson
        );

        $css = sprintf(
            '<link rel="stylesheet" type="text/css" href="%s/css?v=%s">',
            $base, $v);
        $js = sprintf(
            '<script type="text/javascript" src="%s/js?v=%s"></script>',
            $base, $v);

        $headInject = $rulesScript . "\n" . $css;
        $bodyInject = $js;

        // Admin assets on plugin config pages
        $isAdminPage = (strpos($_SERVER['REQUEST_URI'] ?? '', 'plugins.php') !== false);
        if ($isAdminPage) {
            $adminCss = sprintf(
                '<link rel="stylesheet" type="text/css" href="%s/admin-css?v=%s">',
                $base, $v);
            $adminJs = sprintf(
                '<script type="text/javascript" src="%s/admin-js?v=%s"></script>',
                $base, $v);
            $headInject .= "\n" . $adminCss;
            $bodyInject .= "\n" . $adminJs;
        }

        $buffer = str_replace('</head>', $headInject . "\n</head>", $buffer);
        $buffer = str_replace('</body>', $bodyInject . "\n</body>", $buffer);

        return $buffer;
    }
}

// Static bootstrap for early-load scenarios
if (defined('STAFFINC_DIR'))
    VisibilityControlPlugin::bootstrapStatic();
