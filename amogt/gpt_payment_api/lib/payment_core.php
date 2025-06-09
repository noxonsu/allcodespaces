<?php
// gpt_payment_api/lib/payment_core.php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/../../logger.php';

// Предполагается, что BALANCE_CURRENCY определена в config.php или глобально
// Если нет, можно определить здесь, но лучше в конфиге
if (!defined('BALANCE_CURRENCY')) {
    define('BALANCE_CURRENCY', 'RUB'); // Валюта баланса по умолчанию
}

class PaymentCore {

    public static function getExchangeRate(string $currency_from): ?float {
        $db = new DB();
        $rates = $db->read('exchange_rates');
        $currency_pair = strtoupper($currency_from) . '_' . BALANCE_CURRENCY;

        if (isset($rates[$currency_pair]['rate'])) {
            return (float)$rates[$currency_pair]['rate'];
        }
        logMessage("[GPT_PAYMENT_CORE] Exchange rate not found for pair: {$currency_pair}", "WARNING");
        return null;
    }

    public static function getPaymentCost(float $payment_amount, string $payment_currency): ?array {
        $payment_currency = strtoupper($payment_currency);

        if ($payment_currency === BALANCE_CURRENCY) {
            return [
                'cost_in_balance_units' => $payment_amount,
                'rate_used' => 1.0,
                'rate_currency_pair' => BALANCE_CURRENCY . '_' . BALANCE_CURRENCY
            ];
        }

        $rate = self::getExchangeRate($payment_currency);
        if ($rate === null) {
            logMessage("[GPT_PAYMENT_CORE] Cannot get payment cost, rate not found for {$payment_currency}", "ERROR");
            return null;
        }

        $cost_in_balance_units = $payment_amount * $rate;
        return [
            'cost_in_balance_units' => round($cost_in_balance_units, 2), // Округляем до 2 знаков
            'rate_used' => $rate,
            'rate_currency_pair' => $payment_currency . '_' . BALANCE_CURRENCY
        ];
    }

    public static function processPayment(string $partner_token, float $payment_amount, string $payment_currency, string $service_details = ''): array {
        $db = new DB();
        $partners = $db->read('partners');
        $partner_index = -1;
        $current_partner = null;

        foreach ($partners as $index => $p) {
            if ($p['token'] === $partner_token) {
                $partner_index = $index;
                $current_partner = $p;
                break;
            }
        }

        if (!$current_partner) {
            logMessage("[GPT_PAYMENT_CORE] Partner not found for token during payment processing.", "ERROR");
            return ['status' => 'error', 'message' => 'Partner not found.'];
        }

        $costDetails = self::getPaymentCost($payment_amount, $payment_currency);
        if (!$costDetails) {
            return ['status' => 'error', 'message' => 'Could not determine payment cost. Rate not set for ' . $payment_currency];
        }

        $cost_in_balance_units = $costDetails['cost_in_balance_units'];

        if ((float)$current_partner['balance'] < $cost_in_balance_units) {
            return [
                'status' => 'insufficient_funds',
                'message' => 'Insufficient funds.',
                'required_balance' => $cost_in_balance_units,
                'current_balance' => (float)$current_partner['balance']
            ];
        }

        // Списание с баланса
        $partners[$partner_index]['balance'] = (float)$current_partner['balance'] - $cost_in_balance_units;
        
        $transaction_id = uniqid('txn_');
        $transaction = [
            'id' => $transaction_id,
            'partner_id' => $current_partner['id'],
            'partner_name' => $current_partner['name'],
            'payment_amount' => $payment_amount,
            'payment_currency' => $payment_currency,
            'rate_used' => $costDetails['rate_used'],
            'amount_deducted' => $cost_in_balance_units, // Сумма в валюте баланса
            'balance_before' => (float)$current_partner['balance'],
            'balance_after' => $partners[$partner_index]['balance'],
            'status' => 'success', // Предполагаем успех, если дошли до сюда
            'service_details' => $service_details,
            'error_message' => null,
            'timestamp' => date('Y-m-d H:i:s')
        ];

        // Сохраняем обновленные данные партнеров и транзакцию
        $transactions = $db->read('transactions');
        $transactions[] = $transaction;

        if ($db->write('partners', $partners) && $db->write('transactions', $transactions)) {
            logMessage("[GPT_PAYMENT_CORE] Payment processed successfully. Partner: {$current_partner['name']}, Amount: {$payment_amount} {$payment_currency}, Deducted: {$cost_in_balance_units} " . BALANCE_CURRENCY . ". Txn ID: {$transaction_id}");
            // Здесь должна быть реальная логика проведения платежа через ChatGPT API
            // Для примера, просто возвращаем успех
            return [
                'status' => 'success',
                'message' => 'Payment processed successfully.',
                'transaction_id' => $transaction_id,
                'new_balance' => $partners[$partner_index]['balance']
            ];
        } else {
            logMessage("[GPT_PAYMENT_CORE] Failed to save data after payment processing for partner: {$current_partner['name']}", "ERROR");
            // Откат не реализован, но в реальной системе он бы понадобился
            return ['status' => 'error', 'message' => 'Failed to save transaction or update balance. Payment not completed.'];
        }
    }

    public static function getTransactionStatus(string $transaction_id, string $partner_token_check): ?array {
        $db = new DB();
        $transactions = $db->read('transactions');
        $partner = AuthPartner::getPartnerByToken($partner_token_check);

        if (!$partner) return null; // Партнер не найден

        foreach ($transactions as $transaction) {
            if ($transaction['id'] === $transaction_id) {
                // Убедимся, что транзакция принадлежит этому партнеру
                if ($transaction['partner_id'] === $partner['id']) {
                    return $transaction;
                } else {
                    logMessage("[GPT_PAYMENT_CORE] Access denied for transaction {$transaction_id}. Partner token does not match transaction owner.", "WARNING");
                    return null; // Доступ запрещен
                }
            }
        }
        logMessage("[GPT_PAYMENT_CORE] Transaction not found: {$transaction_id}", "INFO");
        return null;
    }
}
?>
