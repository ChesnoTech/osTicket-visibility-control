<?php
return array(
    'id'          => 'chesnotech:visibility-control',
    'version'     => '1.2.0',
    'name'        => /* trans */ 'Visibility Control',
    'author'      => 'ChesnoTech',
    'description' => /* trans */ 'Controls which ticket statuses each agent/department can see and use, and which departments they can transfer tickets to.',
    'url'         => 'https://github.com/ChesnoTech/osTicket-visibility-control',
    'ost_version' => '1.18',
    'plugin'      => 'class.VisibilityControlPlugin.php:VisibilityControlPlugin',
);
