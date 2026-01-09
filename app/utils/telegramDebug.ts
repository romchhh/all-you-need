/**
 * Утиліта для діагностики Telegram WebApp
 */

export function logTelegramEnvironment() {
  if (typeof window === 'undefined') {
    console.log('Running on server side');
    return;
  }

  console.log('='.repeat(60));
  console.log('TELEGRAM WEBAPP DIAGNOSTIC INFO');
  console.log('='.repeat(60));
  
  // Перевірка наявності Telegram API
  console.log('\n1. TELEGRAM API AVAILABILITY:');
  console.log('  window.Telegram:', typeof window.Telegram);
  console.log('  window.Telegram.WebApp:', typeof (window as any).Telegram?.WebApp);
  
  if ((window as any).Telegram?.WebApp) {
    const tg = (window as any).Telegram.WebApp;
    
    console.log('\n2. TELEGRAM WEBAPP INFO:');
    console.log('  Platform:', tg.platform);
    console.log('  Version:', tg.version);
    console.log('  Color scheme:', tg.colorScheme);
    console.log('  Is expanded:', tg.isExpanded);
    console.log('  Viewport height:', tg.viewportHeight);
    console.log('  Viewport stable height:', tg.viewportStableHeight);
    
    console.log('\n3. INIT DATA (RAW):');
    console.log('  initData string:', tg.initData);
    console.log('  initData length:', tg.initData?.length || 0);
    console.log('  initData is empty:', !tg.initData || tg.initData.length === 0);
    
    console.log('\n4. INIT DATA UNSAFE (PARSED):');
    console.log('  initDataUnsafe:', tg.initDataUnsafe);
    console.log('  initDataUnsafe (JSON):', JSON.stringify(tg.initDataUnsafe, null, 2));
    
    if (tg.initDataUnsafe?.user) {
      console.log('\n5. USER DATA:');
      console.log('  User ID:', tg.initDataUnsafe.user.id);
      console.log('  Username:', tg.initDataUnsafe.user.username);
      console.log('  First name:', tg.initDataUnsafe.user.first_name);
      console.log('  Last name:', tg.initDataUnsafe.user.last_name);
      console.log('  Language:', tg.initDataUnsafe.user.language_code);
      console.log('  Is premium:', tg.initDataUnsafe.user.is_premium);
      console.log('  Photo URL:', tg.initDataUnsafe.user.photo_url);
    } else {
      console.log('\n5. USER DATA:');
      console.log('  ❌ NO USER DATA AVAILABLE');
      console.log('  This means initDataUnsafe.user is null/undefined');
    }
    
    console.log('\n6. OTHER INIT DATA:');
    console.log('  Query ID:', tg.initDataUnsafe?.query_id);
    console.log('  Auth date:', tg.initDataUnsafe?.auth_date);
    console.log('  Hash:', tg.initDataUnsafe?.hash);
    console.log('  Start param:', tg.initDataUnsafe?.start_param);
    
  } else {
    console.log('\n❌ TELEGRAM WEBAPP NOT AVAILABLE');
    console.log('Possible reasons:');
    console.log('  1. Opened in regular browser (not Telegram app)');
    console.log('  2. Telegram script not loaded');
    console.log('  3. Using incompatible Telegram version');
  }
  
  console.log('\n7. CURRENT URL:');
  console.log('  Full URL:', window.location.href);
  console.log('  Pathname:', window.location.pathname);
  console.log('  Search params:', window.location.search);
  console.log('  Hash:', window.location.hash);
  
  const urlParams = new URLSearchParams(window.location.search);
  console.log('  URL parameters:');
  urlParams.forEach((value, key) => {
    console.log(`    ${key}: ${value}`);
  });
  
  console.log('\n8. USER AGENT:');
  console.log('  ', navigator.userAgent);
  
  console.log('\n' + '='.repeat(60));
  console.log('END OF DIAGNOSTIC INFO');
  console.log('='.repeat(60) + '\n');
}

// Автоматично викликаємо при завантаженні в development режимі
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // Чекаємо поки Telegram WebApp ініціалізується
  setTimeout(() => {
    logTelegramEnvironment();
  }, 100);
}
