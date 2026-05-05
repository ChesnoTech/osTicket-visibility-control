<?php
/**
 * Visibility Control Plugin — Configuration
 *
 * @author  ChesnoTech
 * @version 1.1.0
 */

class VisibilityControlConfig extends PluginConfig {

    function getOptions() {
        $root = ROOT_PATH . 'scp/ajax.php/visibility-control/admin';
        return array(
            'info' => new SectionBreakField(array(
                'label' => /* trans */ 'Visibility Control',
                'hint'  => sprintf(
                    /* trans */ 'Configure status and transfer visibility rules from the '
                    . '<a href="%s" target="_blank" style="font-weight:bold;">admin panel</a>.',
                    $root
                ),
            )),
        );
    }

    /**
     * Ensure the rules table exists in the database.
     * Safe to call multiple times (CREATE IF NOT EXISTS).
     */
    static function ensureTable() {
        $prefix = TABLE_PREFIX;
        db_query("CREATE TABLE IF NOT EXISTS `{$prefix}visibility_control_rules` (
            `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `rule_type`   ENUM('status','transfer') NOT NULL,
            `scope_type`  ENUM('agent','department') NOT NULL,
            `scope_id`    INT UNSIGNED NOT NULL,
            `target_id`   INT UNSIGNED NOT NULL,
            `created`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uq_rule` (`rule_type`, `scope_type`, `scope_id`, `target_id`),
            KEY `idx_scope` (`scope_type`, `scope_id`),
            KEY `idx_rule_type` (`rule_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }
}
