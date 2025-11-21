/**
 * Konzum Unit Price Sorter
 * A Safari extension that adds sorting by unit price on Konzum product pages
 *
 * @author Konzum Unit Price Sorter Contributors
 * @license MIT
 */
(function() {
  'use strict';

  const DEBUG = false; // Set to true to enable console logs for debugging

  /**
   * Log debug messages to console when DEBUG is enabled
   * @param {...any} args - Arguments to log
   */
  function log(...args) {
    if (DEBUG) console.log('[Konzum Sorter]', ...args);
  }

  /**
   * Parse unit price from text like "0,41 €/kom" or "0.41 €/kom"
   * Handles both comma and dot as decimal separators
   * @param {string} priceText - Text containing the price
   * @returns {number|null} Parsed price as a number, or null if invalid
   */
  function parseUnitPrice(priceText) {
    if (!priceText) return null;

    // Extract number from text (handle both comma and dot as decimal separator)
    const match = priceText.match(/(\d+[,.]?\d*)/);
    if (!match) return null;

    // Convert to number (replace comma with dot for parsing)
    const price = parseFloat(match[1].replace(',', '.'));
    return isNaN(price) ? null : price;
  }

  /**
   * Find the sorting dropdown on the page
   * Looks for "Sortiraj po" label or options containing sorting keywords
   * @returns {HTMLSelectElement|null} The sorting dropdown element or null if not found
   */
  function findSortingDropdown() {
    // Look for "Sortiraj po" dropdown
    const selects = document.querySelectorAll('select');
    log(`Found ${selects.length} select elements`);

    for (let select of selects) {
      const label = select.previousElementSibling;
      if (label && label.textContent.includes('Sortiraj')) {
        log('Found sorting dropdown via label');
        return select;
      }
      // Also check if the select itself has options about sorting
      const options = select.querySelectorAll('option');
      for (let option of options) {
        if (option.textContent.includes('Relevantnost') ||
            option.textContent.includes('Naziv') ||
            option.textContent.includes('Cijena')) {
          log('Found sorting dropdown via options');
          return select;
        }
      }
    }
    return null;
  }

  /**
   * Get all product cards from the page
   * Tries multiple strategies to find product elements
   * @returns {Array<HTMLElement>} Array of product card elements
   */
  function getProductCards() {
    log('Searching for product cards...');

    // First, try to find product-item elements directly (only article tags)
    const productItems = document.querySelectorAll('article.product-item');
    if (productItems.length > 3) {
      log(`Found ${productItems.length} product items via article.product-item selector`);
      return Array.from(productItems);
    }

    // Fallback to other selectors
    const altItems = document.querySelectorAll('.product-item, .product-card');
    if (altItems.length > 3) {
      log(`Found ${altItems.length} product items via fallback selector`);
      return Array.from(altItems);
    }

    // Try to find links to product pages
    const productLinks = Array.from(document.querySelectorAll('a[href*="/web/products/"]'));
    log(`Found ${productLinks.length} product links`);

    if (productLinks.length > 0) {
      // Find the common parent that represents each product card
      const cards = [];
      const seenElements = new Set();

      for (let link of productLinks) {
        // Go up the DOM tree to find the product card container
        let current = link;
        let candidate = null;

        // Try to find article.product-item or similar
        for (let i = 0; i < 10; i++) {
          current = current.parentElement;
          if (!current) break;

          // Look for the actual product card (article or div with product classes)
          if (current.tagName === 'ARTICLE' ||
              current.classList.contains('product-item') ||
              current.classList.contains('product-card') ||
              current.className.includes('product-default')) {
            candidate = current;
            break;
          }
        }

        if (candidate && !seenElements.has(candidate)) {
          seenElements.add(candidate);
          cards.push(candidate);
        }
      }

      if (cards.length > 0) {
        log(`Found ${cards.length} product cards via product links`);
        return cards;
      }
    }

    // Fallback: Try specific selectors
    const selectors = [
      '.product-card',
      '[data-product]',
      '.product-item',
      'article.product',
      '.product',
      '[class*="ProductCard"]',
      '[class*="product-"]'
    ];

    for (let selector of selectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        const hasPrice = cards[0].textContent.includes('€') || cards[0].textContent.includes('Cijena');
        if (hasPrice) {
          log(`Found ${cards.length} cards using selector: ${selector}`);
          return Array.from(cards);
        }
      }
    }

    // Last resort: find grid/list containers
    const containers = document.querySelectorAll('[class*="grid"], [class*="list"], [class*="results"], [class*="Grid"], [class*="List"]');
    log(`Trying ${containers.length} container elements`);

    for (let container of containers) {
      const children = Array.from(container.children);
      if (children.length > 3 && children[0].textContent.includes('€')) {
        log(`Found ${children.length} cards in container with class: ${container.className}`);
        return children;
      }
    }

    log('No product cards found!');
    return [];
  }

  /**
   * Extract unit price from a product card element
   * Searches for "Cijena za j.m." text and extracts the price
   * @param {HTMLElement} card - The product card element
   * @returns {number|null} The unit price or null if not found
   */
  function extractUnitPrice(card) {
    // Look for text containing "Cijena za j.m."
    const text = card.textContent;
    const regex = /Cijena za j\.m\.:?\s*(\d+[,.]?\d*)\s*€/i;
    const match = text.match(regex);

    if (match) {
      const price = parseUnitPrice(match[1]);
      log(`Found unit price: ${price} €`);
      return price;
    }

    // Alternative: look for element with unit price
    const priceElements = card.querySelectorAll('[class*="unit"], [class*="j.m."], small, .price-info, span, div');
    for (let elem of priceElements) {
      const elemText = elem.textContent;
      if (elemText.includes('j.m.')) {
        const priceMatch = elemText.match(/(\d+[,.]?\d*)\s*€/);
        if (priceMatch) {
          const price = parseUnitPrice(priceMatch[1]);
          if (price !== null) {
            log(`Found unit price in element: ${price} €`);
            return price;
          }
        }
      }
    }

    return null;
  }

  // Global variables to store current sort state
  let currentSortState = null;
  let sortObserver = null;
  let allProductsData = []; // Store all products from all pages

  /**
   * Fetch all products from all pages by analyzing pagination
   * Makes multiple requests to get products from each page
   * @returns {Promise<Array<Object>>} Array of product objects with element, unitPrice, page, name, and html
   */
  async function fetchAllProducts() {
    log('Fetching all products from all pages...');

    const allProducts = [];
    const baseUrl = new URL(window.location.href);
    const params = new URLSearchParams(baseUrl.search);

    // Try to get total number of pages
    const paginationLinks = document.querySelectorAll('.pagination a, [class*="pagination"] a, [class*="page"] a');
    let maxPage = 1;

    paginationLinks.forEach(link => {
      const match = link.textContent.match(/\d+/);
      if (match) {
        const pageNum = parseInt(match[0]);
        if (pageNum > maxPage) maxPage = pageNum;
      }
    });

    log(`Detected ${maxPage} pages to fetch`);

    // Fetch each page
    for (let page = 1; page <= maxPage; page++) {
      try {
        let pageUrl;
        if (page === 1) {
          // Current page
          const cards = getProductCards();
          cards.forEach(card => {
            const unitPrice = extractUnitPrice(card);
            const productName = card.querySelector('a[href*="/web/products/"]')?.textContent?.trim() || '';
            allProducts.push({
              element: card,
              unitPrice: unitPrice,
              page: page,
              name: productName,
              html: card.outerHTML
            });
          });
          log(`Page ${page}: ${cards.length} products`);
        } else {
          // Fetch other pages
          params.set('page', page);
          pageUrl = `${baseUrl.origin}${baseUrl.pathname}?${params.toString()}`;

          log(`Fetching page ${page}: ${pageUrl}`);
          const response = await fetch(pageUrl);
          const html = await response.text();

          // Parse HTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // Extract products from this page
          const cards = doc.querySelectorAll('article.product-item');
          cards.forEach(card => {
            const unitPrice = extractUnitPrice(card);
            const productName = card.querySelector('a[href*="/web/products/"]')?.textContent?.trim() || '';
            allProducts.push({
              element: null, // Not in current DOM
              unitPrice: unitPrice,
              page: page,
              name: productName,
              html: card.outerHTML
            });
          });
          log(`Page ${page}: ${cards.length} products`);
        }
      } catch (error) {
        log(`Error fetching page ${page}:`, error);
      }
    }

    log(`Fetched ${allProducts.length} total products from ${maxPage} pages`);
    return allProducts;
  }

  /**
   * Sort all products globally across all pages and show them on one page
   * Fetches products from all pages, sorts them, and displays everything together
   * @param {boolean} ascending - True for ascending sort, false for descending
   */
  async function sortByUnitPriceGlobally(ascending = true) {
    log(`Starting GLOBAL sort: ${ascending ? 'ascending' : 'descending'}`);

    // Store sort state
    currentSortState = { ascending: ascending, global: true };

    // Check if there are multiple pages
    const paginationLinks = document.querySelectorAll('.pagination a, [class*="pagination"] a, [class*="page"] a');
    let hasPagination = false;

    paginationLinks.forEach(link => {
      const text = link.textContent.trim();
      if (text.match(/^\d+$/)) {
        hasPagination = true;
      }
    });

    // If only one page, just do local sort
    if (!hasPagination) {
      log('Only one page detected, using local sort');
      sortByUnitPrice(ascending);
      return;
    }

    // Show loading message
    showNotification('Učitavam sve proizvode sa svih stranica...');

    // Fetch all products
    allProductsData = await fetchAllProducts();

    if (allProductsData.length === 0) {
      log('ERROR: No products found!');
      alert('Nije pronađeno proizvoda za sortiranje.');
      return;
    }

    // Filter products with unit prices
    const withPrice = allProductsData.filter(p => p.unitPrice !== null);
    const withoutPrice = allProductsData.filter(p => p.unitPrice === null);

    log(`${withPrice.length} products with unit price, ${withoutPrice.length} without`);

    // Sort products by unit price
    withPrice.sort((a, b) => {
      return ascending ? a.unitPrice - b.unitPrice : b.unitPrice - a.unitPrice;
    });

    // Combine sorted with price + unsorted
    const sortedAll = [...withPrice, ...withoutPrice];

    // Display ALL products on one page
    replaceCurrentPageProducts(sortedAll);

    // Hide pagination since we're showing everything
    hidePagination();

    // Show success message
    const direction = ascending ? 'najniža → najviša' : 'najviša → najniža';
    showNotification(`Prikazano svih ${allProductsData.length} proizvoda sortirano po cijeni za j.m.: ${direction}`);
  }

  // Hide pagination controls
  function hidePagination() {
    const paginationElements = document.querySelectorAll('.pagination, [class*="pagination"], [class*="Pagination"]');
    paginationElements.forEach(elem => {
      elem.style.display = 'none';
    });
    log('Pagination hidden');
  }

  // Get current page number from URL or pagination
  function getCurrentPageNumber() {
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get('page');
    if (pageParam) return parseInt(pageParam);

    // Try to find from pagination
    const activePage = document.querySelector('.pagination .active, [class*="pagination"] .active, [class*="page"].active');
    if (activePage) {
      const match = activePage.textContent.match(/\d+/);
      if (match) return parseInt(match[0]);
    }

    return 1;
  }

  // Replace products on current page
  function replaceCurrentPageProducts(products) {
    const container = document.querySelector('.product-list, [class*="product-list"]');
    if (!container) {
      log('ERROR: Container not found');
      return;
    }

    // Remove existing products
    const existingCards = container.querySelectorAll('article.product-item');
    existingCards.forEach(card => card.remove());

    // Add new sorted products
    products.forEach(product => {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = product.html;
      const newCard = tempDiv.firstElementChild;
      container.appendChild(newCard);
    });

    log(`Replaced ${products.length} products on current page`);
  }

  /**
   * Sort products by unit price on the current page only
   * Uses CSS flexbox order property to reorder elements
   * @param {boolean} ascending - True for ascending sort, false for descending
   */
  function sortByUnitPrice(ascending = true) {
    log(`Starting LOCAL sort: ${ascending ? 'ascending' : 'descending'}`);

    // Store sort state
    currentSortState = { ascending: ascending, global: false };

    const cards = getProductCards();
    if (cards.length === 0) {
      log('ERROR: No product cards found to sort!');
      alert('Nije pronađeno proizvoda za sortiranje. Osvježite stranicu i pokušajte ponovno.');
      return;
    }

    log(`Found ${cards.length} product cards to sort`);

    // Get parent container - should be the common parent of all cards
    const container = cards[0].parentElement;
    if (!container) {
      log('ERROR: No parent container found!');
      return;
    }

    log(`Parent container: ${container.tagName}.${container.className}`);
    log(`Container has ${container.children.length} direct children`);

    // Verify all cards share the same parent
    const allSameParent = cards.every(card => card.parentElement === container);
    if (!allSameParent) {
      log('WARNING: Not all cards have the same parent!');
    } else {
      log('✓ All cards share the same parent container');
    }

    // Check container's display mode
    const currentDisplay = window.getComputedStyle(container).display;
    log(`Container display mode: ${currentDisplay}`);

    // Get and log flex properties
    const computedStyle = window.getComputedStyle(container);
    log(`Flex direction: ${computedStyle.flexDirection}`);
    log(`Flex wrap: ${computedStyle.flexWrap}`);

    // Ensure flex properties are set correctly for order to work
    if (!container.style.display || container.style.display !== 'flex') {
      container.style.display = 'flex';
    }
    if (!container.style.flexWrap) {
      container.style.flexWrap = 'wrap';
    }
    // Ensure flex-direction is row (default) for proper ordering
    if (!container.style.flexDirection) {
      container.style.flexDirection = 'row';
    }

    log('✓ Container flex properties set');

    // Extract products with their unit prices
    const products = cards.map((card, index) => {
      const unitPrice = extractUnitPrice(card);
      if (unitPrice === null) {
        log(`Product ${index + 1}: NO UNIT PRICE`);
      } else {
        log(`Product ${index + 1}: ${unitPrice} €`);
      }
      return {
        element: card,
        unitPrice: unitPrice,
        originalIndex: index
      };
    });

    // Log products without unit prices
    const withoutPrice = products.filter(p => p.unitPrice === null);
    if (withoutPrice.length > 0) {
      log(`WARNING: ${withoutPrice.length} products without unit price (will be placed at end)`);
    }

    // Count products with prices
    const withPrice = products.filter(p => p.unitPrice !== null);
    log(`${withPrice.length} products have unit prices and will be sorted`);

    // Sort products
    products.sort((a, b) => {
      // Products without unit price go to the end
      if (a.unitPrice === null && b.unitPrice === null) return 0;
      if (a.unitPrice === null) return 1;
      if (b.unitPrice === null) return -1;

      return ascending ? a.unitPrice - b.unitPrice : b.unitPrice - a.unitPrice;
    });

    // Apply CSS order to each product using multiple methods
    const cssRules = [];

    products.forEach((product, newIndex) => {
      const element = product.element;

      // Debug: log element info for first product
      if (newIndex === 0) {
        log(`First product: ${element.tagName}.${element.className}`);
        log(`Is direct child of container: ${element.parentElement === container}`);
        log(`Element computed display: ${window.getComputedStyle(element).display}`);
      }

      // Verify this is a direct child
      if (element.parentElement !== container) {
        log(`ERROR: Product ${product.originalIndex + 1} is not a direct child of container!`);
        log(`  Element parent: ${element.parentElement?.tagName}.${element.parentElement?.className}`);
        log(`  Container: ${container.tagName}.${container.className}`);
        return;
      }

      // Add unique class for CSS targeting
      const sortClass = `konzum-sort-${newIndex}`;
      element.classList.add(sortClass);
      element.classList.add('konzum-sorted');

      // Set the order using setProperty with !important
      element.style.setProperty('order', newIndex, 'important');

      // Also add data attributes
      element.setAttribute('data-sort-order', newIndex);
      element.setAttribute('data-unit-price', product.unitPrice || 'none');

      // Create CSS rule for this element
      cssRules.push(`.${sortClass} { order: ${newIndex} !important; }`);

      if (newIndex < 3) {
        log(`Set product ${product.originalIndex + 1} (${product.unitPrice}€) to order: ${newIndex}`);
      }
    });

    // Inject CSS rules into the page
    injectSortStyles(cssRules);

    log(`✓ Applied order to ${products.length} products`);

    // Set up aggressive re-application interval
    setupSortMaintainer(container);

    log(`✓ Sorted ${products.length} products by unit price (${ascending ? 'ascending' : 'descending'})`);

    // Show feedback to user
    const direction = ascending ? 'najniža → najviša' : 'najviša → najniža';
    const message = `Sortirano po cijeni za j.m.: ${direction}`;
    showNotification(message);
  }

  // Inject CSS styles that can't be easily overridden
  function injectSortStyles(cssRules) {
    // Remove old style tag if exists
    const oldStyle = document.getElementById('konzum-sort-styles');
    if (oldStyle) {
      oldStyle.remove();
    }

    // Create new style tag
    const style = document.createElement('style');
    style.id = 'konzum-sort-styles';
    style.textContent = cssRules.join('\n');
    document.head.appendChild(style);

    log('✓ Injected CSS sort styles');
  }

  // Set up interval to continuously re-apply sort order
  let sortMaintainerInterval = null;
  let containerObserver = null;

  function setupSortMaintainer(container) {
    // Clear existing interval
    if (sortMaintainerInterval) {
      clearInterval(sortMaintainerInterval);
    }

    // Clear existing observer
    if (containerObserver) {
      containerObserver.disconnect();
    }

    // Watch for DOM changes in the container (re-renders)
    containerObserver = new MutationObserver((mutations) => {
      if (!currentSortState) return;

      for (let mutation of mutations) {
        // Check if child nodes were added/removed (re-render)
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          log('Container children changed (re-render detected), re-sorting...');
          // Small delay to let the framework finish rendering
          setTimeout(() => {
            if (currentSortState) {
              sortByUnitPrice(currentSortState.ascending);
            }
          }, 50);
          break;
        }
      }
    });

    // Observe the container for child list changes
    containerObserver.observe(container, {
      childList: true,
      subtree: false
    });

    // Also re-apply order every 200ms as a backup
    sortMaintainerInterval = setInterval(() => {
      if (!currentSortState) return;

      const cards = container.querySelectorAll('article.product-item');
      if (cards.length === 0) return;

      let needsReapply = false;

      // Check if any card lost its sort order
      cards.forEach(card => {
        const expectedOrder = card.getAttribute('data-sort-order');
        if (expectedOrder) {
          const currentOrder = window.getComputedStyle(card).order;
          // Check if computed style doesn't match
          if (currentOrder !== expectedOrder) {
            needsReapply = true;
          }
        } else if (card.classList.contains('konzum-sorted')) {
          // Card has our class but no order attribute - something removed it
          needsReapply = true;
        }
      });

      // Check if there are unsorted cards (new cards added)
      const unsortedCards = Array.from(cards).filter(card => !card.hasAttribute('data-sort-order'));
      if (unsortedCards.length > 0) {
        log(`Found ${unsortedCards.length} unsorted cards, re-sorting...`);
        needsReapply = true;
      }

      if (needsReapply) {
        log('Sort order lost, re-applying...');
        // Re-sort all products
        sortByUnitPrice(currentSortState.ascending);
      }
    }, 200);

    log('✓ Sort maintainer interval and observer set up');
  }

  // Set up MutationObserver to maintain sort order
  function setupSortObserver(container) {
    // Disconnect existing observer if any
    if (sortObserver) {
      sortObserver.disconnect();
    }

    // Create new observer
    sortObserver = new MutationObserver((mutations) => {
      // Check if any product's order style was removed or changed
      let needsReapply = false;

      for (let mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const element = mutation.target;
          if (element.hasAttribute('data-sort-order')) {
            const expectedOrder = element.getAttribute('data-sort-order');
            const currentOrder = element.style.order;
            if (currentOrder !== expectedOrder) {
              needsReapply = true;
              break;
            }
          }
        }
      }

      if (needsReapply && currentSortState) {
        log('DOM changed detected, re-applying sort...');
        // Re-apply order to all elements
        const cards = getProductCards();
        cards.forEach(card => {
          const sortOrder = card.getAttribute('data-sort-order');
          if (sortOrder) {
            card.style.setProperty('order', sortOrder, 'important');
          }
        });
      }
    });

    // Observe all product cards
    const cards = container.querySelectorAll('article.product-item');
    cards.forEach(card => {
      sortObserver.observe(card, {
        attributes: true,
        attributeFilter: ['style']
      });
    });

    log('✓ MutationObserver set up to maintain sort order');
  }

  /**
   * Show a temporary notification message to the user
   * @param {string} message - The message to display
   */
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 20px;
      border-radius: 5px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  // Add custom sorting option
  function addSortingOption() {
    log('Attempting to add sorting option...');

    const dropdown = findSortingDropdown();
    if (!dropdown) {
      log('Sorting dropdown not found, adding custom button');
      addCustomSortButton();
      return;
    }

    // Check if option already exists
    const existingOptions = Array.from(dropdown.options);
    const alreadyExists = existingOptions.some(opt => opt.textContent.includes('j.m.'));

    if (!alreadyExists) {
      // Add new options at the beginning (after the first option if it exists)
      const optionAsc = document.createElement('option');
      optionAsc.value = 'unit-price-asc';
      optionAsc.textContent = 'Cijena za j.m. uzlazno';

      const optionDesc = document.createElement('option');
      optionDesc.value = 'unit-price-desc';
      optionDesc.textContent = 'Cijena za j.m. silazno';

      // Insert at the beginning (positions 0 and 1)
      if (dropdown.options.length > 0) {
        dropdown.insertBefore(optionAsc, dropdown.options[0]);
        dropdown.insertBefore(optionDesc, dropdown.options[1]);
      } else {
        dropdown.appendChild(optionAsc);
        dropdown.appendChild(optionDesc);
      }

      log('✓ Unit price sorting options added to dropdown at the top');
    } else {
      log('Unit price sorting options already exist');
    }

    // Check if one of our custom sorts is already selected (from previous page visit)
    const currentValue = dropdown.value;
    if (currentValue === 'unit-price-asc') {
      log('Custom sort already selected on page load (ascending), applying...');
      sortByUnitPriceGlobally(true);
    } else if (currentValue === 'unit-price-desc') {
      log('Custom sort already selected on page load (descending), applying...');
      sortByUnitPriceGlobally(false);
    }

    // Listen for changes - use multiple event types for framework compatibility
    const handleChange = function(e) {
      const value = e.target.value;
      log(`Dropdown changed to: ${value}`);
      if (value === 'unit-price-asc') {
        sortByUnitPriceGlobally(true); // Use global sort
      } else if (value === 'unit-price-desc') {
        sortByUnitPriceGlobally(false); // Use global sort
      } else {
        // User selected a different sort, clear our custom sort state
        currentSortState = null;
        if (sortMaintainerInterval) {
          clearInterval(sortMaintainerInterval);
          sortMaintainerInterval = null;
        }
        // Remove our custom classes
        const sortedCards = document.querySelectorAll('.konzum-sorted');
        sortedCards.forEach(card => {
          card.classList.remove('konzum-sorted');
          // Remove all konzum-sort-* classes
          const classes = Array.from(card.classList);
          classes.forEach(cls => {
            if (cls.startsWith('konzum-sort-')) {
              card.classList.remove(cls);
            }
          });
        });
      }
    };

    dropdown.addEventListener('change', handleChange);
    dropdown.addEventListener('input', handleChange); // For some frameworks

    // Also poll for changes as a fallback
    let lastValue = dropdown.value;
    setInterval(() => {
      if (dropdown.value !== lastValue) {
        lastValue = dropdown.value;
        log(`Dropdown value changed via polling to: ${dropdown.value}`);
        if (dropdown.value === 'unit-price-asc') {
          sortByUnitPriceGlobally(true);
        } else if (dropdown.value === 'unit-price-desc') {
          sortByUnitPriceGlobally(false);
        } else {
          // Clear custom sort state
          currentSortState = null;
          if (sortMaintainerInterval) {
            clearInterval(sortMaintainerInterval);
            sortMaintainerInterval = null;
          }
        }
      }
    }, 500);
  }

  // Add custom sort button if dropdown not found
  function addCustomSortButton() {
    // Check if already added
    if (document.querySelector('.konzum-unit-price-sorter')) {
      log('Custom buttons already added');
      return;
    }

    // Find a suitable place to add the button (near search results)
    const searchResults = document.querySelector('[class*="results"], [class*="products"], [class*="Results"], [class*="Products"], main');
    if (!searchResults) {
      log('No suitable location found for custom buttons');
      return;
    }

    // Create container for custom sort buttons
    const container = document.createElement('div');
    container.className = 'konzum-unit-price-sorter';
    container.style.cssText = 'margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;';

    const label = document.createElement('span');
    label.textContent = 'Sortiraj po cijeni za j.m.: ';
    label.style.cssText = 'margin-right: 10px; font-weight: bold;';
    container.appendChild(label);

    const btnAsc = document.createElement('button');
    btnAsc.textContent = '↑ Uzlazno';
    btnAsc.className = 'unit-price-sort-btn';
    btnAsc.style.cssText = 'margin-right: 10px; padding: 8px 15px; cursor: pointer; background: #fff; border: 1px solid #ddd; border-radius: 3px;';
    btnAsc.addEventListener('click', () => {
      log('Ascending button clicked');
      sortByUnitPrice(true);
    });
    container.appendChild(btnAsc);

    const btnDesc = document.createElement('button');
    btnDesc.textContent = '↓ Silazno';
    btnDesc.className = 'unit-price-sort-btn';
    btnDesc.style.cssText = 'padding: 8px 15px; cursor: pointer; background: #fff; border: 1px solid #ddd; border-radius: 3px;';
    btnDesc.addEventListener('click', () => {
      log('Descending button clicked');
      sortByUnitPrice(false);
    });
    container.appendChild(btnDesc);

    // Add hover effect
    const addHoverEffect = (btn) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#e0e0e0';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = '#fff';
      });
    };
    addHoverEffect(btnAsc);
    addHoverEffect(btnDesc);

    // Insert at the beginning of search results
    searchResults.insertBefore(container, searchResults.firstChild);
    log('✓ Custom sorting buttons added');
  }

  // Watch for URL changes (pagination, filters, etc.)
  function watchForPageChanges() {
    let lastUrl = window.location.href;

    // Watch for URL changes via History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    // Also watch for popstate (back/forward buttons)
    window.addEventListener('popstate', handleUrlChange);

    // Poll for URL changes as fallback
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        handleUrlChange();
      }
    }, 500);

    function handleUrlChange() {
      const newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        lastUrl = newUrl;
        log('URL changed to:', newUrl);

        // Wait a bit for new content to load
        setTimeout(() => {
          // Re-initialize sorting options
          addSortingOption();

          // If we have an active sort state, re-apply it
          if (currentSortState) {
            log('Re-applying sort after page change...');
            setTimeout(() => {
              sortByUnitPrice(currentSortState.ascending);
            }, 500);
          }
        }, 100);
      }
    }

    log('✓ Watching for page changes (pagination, filters, etc.)');
  }

  // Initialize
  function init() {
    log('=== Konzum Unit Price Sorter Initialized ===');
    log('URL:', window.location.href);

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addSortingOption);
    } else {
      addSortingOption();
    }

    // Also try after delays in case content is loaded dynamically
    setTimeout(() => {
      log('Retry adding sorting option (1s delay)');
      addSortingOption();
    }, 1000);

    setTimeout(() => {
      log('Retry adding sorting option (2s delay)');
      addSortingOption();
    }, 2000);

    // Watch for page changes (pagination)
    watchForPageChanges();

    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  init();
})();
