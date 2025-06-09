<?php

function getPaymentDetails($filePath) {
  // Read HTML from the local file
  $html = file_get_contents($filePath);
  
  if ($html === false) {
    echo "Error reading file: " . $filePath . "\n";
    return;
  }
  
  echo "Page content loaded from " . $filePath . "\n";
  
  // Use a more flexible regex to find the CurrencyAmount span content
  // This regex accounts for potential whitespace and other attributes within the span tag
  if (preg_match('/<[^>]+class="CurrencyAmount">([^0-9]+)([\d.]+)<\/span>/s', $html, $matches)) {
    $currency = trim($matches[1]);
    $amount = trim($matches[2]);
    
    echo "Raw extracted text: {$matches[0]}\n";
    echo "Currency: {$currency}\n";
    echo "Amount: {$amount}\n";
  } else {
    echo "CurrencyAmount element not found using regex.\n";
  }
}

$filePath = 'amogt/debug_page.html'; // Path to the local debug HTML file
getPaymentDetails($filePath);

?>
