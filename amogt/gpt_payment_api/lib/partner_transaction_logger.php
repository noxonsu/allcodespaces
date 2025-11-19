<?php
// gpt_payment_api/lib/partner_transaction_logger.php
require_once __DIR__ . '/../../logger.php';
require_once __DIR__ . '/db.php';

class PartnerTransactionLogger {
    
    /**
     * Логирует транзакцию партнера при получении заявки через API
     * 
     * @param array $partner - Данные партнера
     * @param array $leadData - Данные заявки от партнера
     * @param float $chargeAmount - Сумма списания (обычно 25 USD)
     * @param string $leadId - ID лида в нашей системе
     * @return string - ID транзакции
     */
    public static function logLeadTransaction(array $partner, array $leadData, float $chargeAmount, string $leadId): string {
        $db = new DB();
        $transactions = $db->read('partner_lead_transactions');
        
        $transaction_id = uniqid('lead_txn_', true);
        $currentTime = date('Y-m-d H:i:s');
        
        $transaction = [
            'transaction_id' => $transaction_id,
            'partner_id' => $partner['id'],
            'partner_name' => $partner['name'],
            'lead_id' => $leadId,
            'partner_deal_id' => $leadData['dealId'] ?? null,
            'charge_amount_usd' => $chargeAmount,
            'partner_balance_before' => (float)$partner['balance'],
            'partner_balance_after' => (float)$partner['balance'] - $chargeAmount,
            'lead_data_received' => $leadData, // Полные данные заявки от партнера
            'status' => 'charged', // charged, pending, completed, failed
            'created_at' => $currentTime,
            'updated_at' => $currentTime,
            'completion_status' => null, // Будет обновлено при получении отчета от Zeno
            'completion_details' => null
        ];
        
        $transactions[] = $transaction;
        
        if ($db->write('partner_lead_transactions', $transactions)) {
            logMessage("[PARTNER_TXN_LOGGER] Logged lead transaction. TxnID: {$transaction_id}, Partner: {$partner['name']}, LeadID: {$leadId}, Charge: {$chargeAmount} USD");
            return $transaction_id;
        } else {
            logMessage("[PARTNER_TXN_LOGGER] Failed to save lead transaction. Partner: {$partner['name']}, LeadID: {$leadId}", "ERROR");
            throw new Exception("Failed to log partner transaction");
        }
    }
    
    /**
     * Обновляет статус транзакции при получении отчета от Zeno
     * 
     * @param string $leadId - ID лида в нашей системе
     * @param string $completionStatus - Статус выполнения (Выполнено, ОШИБКА!)
     * @param array $completionDetails - Детали выполнения (amount, currency, email, etc.)
     * @return bool
     */
    public static function updateTransactionCompletion(string $leadId, string $completionStatus, array $completionDetails): bool {
        $db = new DB();
        $transactions = $db->read('partner_lead_transactions');
        
        $updated = false;
        for ($i = 0; $i < count($transactions); $i++) {
            if ($transactions[$i]['lead_id'] === $leadId) {
                $transactions[$i]['completion_status'] = $completionStatus;
                $transactions[$i]['completion_details'] = $completionDetails;
                $transactions[$i]['updated_at'] = date('Y-m-d H:i:s');
                
                // Обновляем общий статус транзакции
                if ($completionStatus === 'Выполнено') {
                    $transactions[$i]['status'] = 'completed';
                } elseif ($completionStatus === 'ОШИБКА!') {
                    $transactions[$i]['status'] = 'failed';
                }
                
                $updated = true;
                break;
            }
        }
        
        if ($updated && $db->write('partner_lead_transactions', $transactions)) {
            logMessage("[PARTNER_TXN_LOGGER] Updated transaction completion for LeadID: {$leadId}, Status: {$completionStatus}");
            return true;
        } else {
            logMessage("[PARTNER_TXN_LOGGER] Failed to update transaction completion for LeadID: {$leadId}", "ERROR");
            return false;
        }
    }
    
    /**
     * Получает транзакции партнера
     * 
     * @param string $partnerId - ID партнера
     * @param int $limit - Лимит записей (по умолчанию 100)
     * @return array
     */
    public static function getPartnerTransactions(string $partnerId, int $limit = 100): array {
        $db = new DB();
        $transactions = $db->read('partner_lead_transactions');
        
        $partnerTransactions = [];
        foreach ($transactions as $transaction) {
            if ($transaction['partner_id'] === $partnerId) {
                $partnerTransactions[] = $transaction;
            }
        }
        
        // Сортируем по дате создания (новые сначала)
        usort($partnerTransactions, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });
        
        return array_slice($partnerTransactions, 0, $limit);
    }
    
    /**
     * Получает все транзакции для админки
     * 
     * @param int $limit - Лимит записей
     * @return array
     */
    public static function getAllTransactions(int $limit = 500): array {
        $db = new DB();
        $transactions = $db->read('partner_lead_transactions');
        
        // Сортируем по дате создания (новые сначала)
        usort($transactions, function($a, $b) {
            return strtotime($b['created_at']) - strtotime($a['created_at']);
        });
        
        return array_slice($transactions, 0, $limit);
    }
    
    /**
     * Получает статистику по партнеру
     * 
     * @param string $partnerId - ID партнера
     * @return array
     */
    public static function getPartnerStats(string $partnerId): array {
        $db = new DB();
        $transactions = $db->read('partner_lead_transactions');
        
        $stats = [
            'total_transactions' => 0,
            'total_charged_usd' => 0,
            'completed_count' => 0,
            'failed_count' => 0,
            'pending_count' => 0,
            'last_transaction_date' => null
        ];
        
        foreach ($transactions as $transaction) {
            if ($transaction['partner_id'] === $partnerId) {
                $stats['total_transactions']++;
                $stats['total_charged_usd'] += (float)$transaction['charge_amount_usd'];
                
                switch ($transaction['status']) {
                    case 'completed':
                        $stats['completed_count']++;
                        break;
                    case 'failed':
                        $stats['failed_count']++;
                        break;
                    default:
                        $stats['pending_count']++;
                        break;
                }
                
                if ($stats['last_transaction_date'] === null || 
                    strtotime($transaction['created_at']) > strtotime($stats['last_transaction_date'])) {
                    $stats['last_transaction_date'] = $transaction['created_at'];
                }
            }
        }
        
        return $stats;
    }
}
?>
