<?php

function getPaymentDetails($url) {
  // Initialize cURL
  $ch = curl_init();
  
  // Set cURL options
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  curl_setopt($ch, CURLOPT_TIMEOUT, 30);
  curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
  
  // Execute cURL request
  $html = curl_exec($ch);
  
  if (curl_error($ch)) {
    echo "cURL Error: " . curl_error($ch) . "\n";
    curl_close($ch);
    return;
  }
  
  curl_close($ch);
  
  // Save HTML for debugging
  file_put_contents('debug_page.html', $html);
  echo "Page content saved to debug_page.html\n";
  
  // Parse HTML to find CurrencyAmount class
  $dom = new DOMDocument();
  @$dom->loadHTML($html);
  $xpath = new DOMXPath($dom);
  
  $elements = $xpath->query("//*[contains(@class, 'CurrencyAmount')]");
  
  if ($elements->length > 0) {
    $paymentInfo = trim($elements->item(0)->textContent);
    
    if ($paymentInfo) {
      // Extract currency and amount using regex
      if (preg_match('/([^\d.,\s]+)?\s*([\d.,]+)\s*([^\d.,\s]+)?/', $paymentInfo, $matches)) {
        $currency = trim($matches[1] ?? $matches[3] ?? '');
        $amount = trim($matches[2]);
        
        // Handle cases like "US$18"
        if (!$currency && strpos($amount, '$') !== false) {
          $parts = preg_split('/(\$)/', $amount, -1, PREG_SPLIT_DELIM_CAPTURE);
          foreach ($parts as $part) {
            if (strpos($part, '$') !== false && strlen($part) > 1) {
              $currency = $part;
            } elseif (is_numeric(str_replace([',', '.'], '', $part))) {
              $amount = $part;
            }
          }
        } elseif ($currency && strpos($amount, trim($currency)) === 0) {
          $amount = substr($amount, strlen(trim($currency)));
        }
        
        echo "Raw extracted text: {$paymentInfo}\n";
        echo "Currency: {$currency}\n";
        echo "Amount: {$amount}\n";
      } else {
        echo "Could not parse payment info: {$paymentInfo}\n";
      }
    } else {
      echo "CurrencyAmount element found but has no text.\n";
    }
  } else {
    echo "CurrencyAmount element not found.\n";
  }
}

$url = 'https://pay.openai.com/c/pay/cs_live_a1zjfp64CRdIHqqWCCdJq0y6r76TwD1WfJJaM1MUtq9oOZeZBiodHDqLEb#fidpamZkaWAnPydgaycpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl';
getPaymentDetails($url);

?>
