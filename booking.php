<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Method not allowed']);
    exit;
}

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function clean_value(string $key, int $maxLength): string
{
    $value = $_POST[$key] ?? '';
    if (!is_string($value)) {
        return '';
    }

    $value = trim($value);
    $value = str_replace(["\r", "\n"], ' ', $value);
    $value = preg_replace('/[[:cntrl:]]/u', '', $value) ?? '';

    if (mb_strlen($value, 'UTF-8') > $maxLength) {
        $value = mb_substr($value, 0, $maxLength, 'UTF-8');
    }

    return $value;
}

function safe_header_value(string $value): string
{
    return str_replace(["\r", "\n", ':'], '', $value);
}

if (!empty($_POST['website'])) {
    respond(200, ['ok' => true]);
}

$name = clean_value('name', 80);
$phone = clean_value('phone', 32);
$guests = clean_value('guests', 16);
$datetime = clean_value('datetime', 40);

if ($name === '' || $phone === '' || $guests === '' || $datetime === '') {
    respond(422, ['ok' => false, 'message' => 'Заполните обязательные поля']);
}

$phoneDigits = preg_replace('/\D+/', '', $phone) ?? '';
if (strlen($phoneDigits) < 10 || strlen($phoneDigits) > 15) {
    respond(422, ['ok' => false, 'message' => 'Введите корректный телефон']);
}

$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
$referer = $_SERVER['HTTP_REFERER'] ?? 'unknown';
$date = date('d.m.Y H:i:s');

$to = 'Dashalavr98@yandex.ru, art.kor0lev@yandex.ru';
$subject = 'Новая бронь столика Brume';

$message = implode("\n", [
    'Новая заявка на бронирование столика',
    '',
    'Имя: ' . $name,
    'Телефон: ' . $phone,
    'Гостей: ' . $guests,
    'Дата и время: ' . $datetime,
    '',
    'Техническая информация:',
    'IP: ' . $ip,
    'User-Agent: ' . $userAgent,
    'Referer: ' . $referer,
    'Дата отправки: ' . $date,
]);

$from = safe_header_value('no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'brume.local'));
$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'From: Brume Booking <' . $from . '>',
    'Reply-To: ' . $from,
    'X-Mailer: PHP/' . phpversion(),
];

$sent = mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $message, implode("\r\n", $headers));

if (!$sent) {
    respond(500, ['ok' => false, 'message' => 'Не удалось отправить заявку']);
}

respond(200, ['ok' => true]);
