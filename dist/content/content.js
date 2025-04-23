// Import flying cards module
const flyingCardsScript = document.createElement('script');
flyingCardsScript.src = chrome.runtime.getURL('content/flying-cards.js');
flyingCardsScript.type = 'text/javascript';
document.head.appendChild(flyingCardsScript);

console.log("Crew Roster Exporter content script loaded");

// Function to extract and format day view data
function extractDayViewData() {
  try {
    // First try to find duty cards in the standard format
    let dutyCards = document.querySelectorAll('.duty-card');
    
    // If no duty cards found, try alternative selectors that might be used in the roster
    if (!dutyCards || dutyCards.length === 0) {
      dutyCards = document.querySelectorAll('.flight-card, .roster-item, .duty-item');
    }
    
    // If still no duty cards found, try to extract from the table structure in the image
    if (!dutyCards || dutyCards.length === 0) {
      console.log('No duty cards found');
      return [];
    }
    
    // Create array to hold all duty data
    const duties = [];
    
    dutyCards.forEach(card => {
      try {
        // Extract basic duty info
        const dateElement = card.querySelector('.duty-date div');
        const timeElement = card.querySelector('.duty-time');
        
        if (!dateElement) return; // Skip if no date found
        
        const date = dateElement.textContent.trim();
        
        // Extract day of week
        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
        
        // Extract time info
        let signOn = '';
        let signOff = '';
        let dutyTime = '';
        let flightTime = '';
        
        if (timeElement) {
          const timeText = timeElement.textContent.trim();
          const timeMatch = timeText.match(/(\d{2}:\d{2})\(L\) ~ .* (\d{2}:\d{2})\(L\)/);
          if (timeMatch) {
            signOn = timeMatch[1];
            signOff = timeMatch[2];
          }
        }
        
        // Extract duty type and flight details
        let dutyType = '';
        let flightDetails = [];
        
        // Check if it's a flight duty
        const flyElements = card.querySelectorAll('.assignment-type');
        if (flyElements && flyElements.length > 0) {
          flyElements.forEach(el => {
            const text = el.textContent.trim();
            if (text) dutyType = text;
          });
        }
        
        // If it's a flight duty, extract flight info
        if (dutyType) {
          const infoDetails = card.querySelectorAll('.info-detail');
          
          if (infoDetails && infoDetails.length > 0) {
            infoDetails.forEach(infoDetail => {
              const leg = {};
              
              // Flight number
              const flightNumberElement = infoDetail.querySelector('.info-middle-top div:first-child');
              if (flightNumberElement) {
                leg.flightNumber = flightNumberElement.textContent.trim();
              }
              
              // Aircraft type and registration
              const aircraftDivs = infoDetail.querySelectorAll('.info-middle-top div');
              if (aircraftDivs.length > 2) {
                const aircraftTypeMatch = aircraftDivs[2].textContent.trim().match(/^(F70|F100|E190)$/);
                if (aircraftTypeMatch) {
                  leg.aircraftType = aircraftTypeMatch[0];
                }
              }
              if (aircraftDivs.length > 4) {
                const aircraftRegMatch = aircraftDivs[4].textContent.trim().match(/^VH[A-Z0-9]+$/);
                if (aircraftRegMatch) {
                  leg.registration = aircraftRegMatch[0];
                }
              }
              
              // Origin
              const originLocationElement = infoDetail.querySelector('.info-start-location:first-of-type');
              const originTimeElement = infoDetail.querySelector('.info-start-time:first-of-type');
              if (originLocationElement) {
                leg.origin = originLocationElement.textContent.trim();
              }
              if (originTimeElement) {
                leg.departureTime = originTimeElement.textContent.trim().replace(' L', '');
              }
              
              // Destination
              const destElements = infoDetail.querySelectorAll('.info-start-location');
              const destTimeElements = infoDetail.querySelectorAll('.info-start-time');
              
              if (destElements.length > 1) {
                leg.destination = destElements[destElements.length - 1].textContent.trim();
              }
              
              if (destTimeElements.length > 1) {
                leg.arrivalTime = destTimeElements[destTimeElements.length - 1].textContent.trim().replace(' L', '');
              }
              
              // Crew details
              const crewElements = infoDetail.querySelectorAll('.info-middle-top');
              if (crewElements.length > 1) {
                const crewText = crewElements[1].textContent.trim();
                leg.crew = crewText.replace(/\s+/g, ' ');
              }
              
              // Try to extract full crew information from the flight log section
              const crewMembers = [];
              
              // Look for expanded flight log with crew details
              const crewTable = infoDetail.querySelector('table, [class*="crew-table"]');
              if (crewTable) {
                const crewRows = crewTable.querySelectorAll('tr');
                crewRows.forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length >= 2) {
                    const position = cells[0].textContent.trim();
                    const name = cells[1].textContent.trim();
                    if (position && name) {
                      crewMembers.push(`${position}: ${name}`);
                    }
                  }
                });
              }
              
              // If we couldn't find crew in a table, look for other crew elements
              if (crewMembers.length === 0) {
                const crewElements = infoDetail.querySelectorAll('[class*="crew-member"], [class*="crew-name"], [class*="crew-position"]');
                crewElements.forEach(element => {
                  const crewText = element.textContent.trim();
                  if (crewText) {
                    crewMembers.push(crewText);
                  }
                });
              }
              
              // If we found crew members, use them instead of just the role
              if (crewMembers.length > 0) {
                leg.crew = crewMembers.join(', ');
              } else if (leg.crew) {
                // If we only have the role, add it as the crew
                leg.crew = leg.crew;
              } else {
                // If we have no crew information, use a placeholder
                leg.crew = 'Crew';
              }
              
              // Extract detailed crew information
              let crewDetails = [];
              
              // When the extension processes the page normally, the crew tables are hidden
              // We need to look inside collapsed content sections
              
              // First, look for any ant-table-tbody regardless of visibility
              const allCrewTables = infoDetail.querySelectorAll('.ant-table-tbody');
              if (allCrewTables && allCrewTables.length > 0) {
                allCrewTables.forEach(table => {
                  // Even if the table is inside a hidden section, we can still extract its content
                  const crewRows = table.querySelectorAll('.ant-table-row');
                  crewRows.forEach(row => {
                    const cells = row.querySelectorAll('.ant-table-cell');
                    if (cells.length >= 3) {
                      const position = cells[0].textContent.trim();
                      const name = cells[1].textContent.trim();
                      const id = cells[2].textContent.trim();
                      
                      if (position && (name || id)) {
                        crewDetails.push({
                          position,
                          name,
                          id
                        });
                      }
                    }
                  });
                });
              }
              
              // Look for memo content that might contain crew information
              if (crewDetails.length === 0) {
                const memoContent = infoDetail.querySelector('.expand-content-memo .content');
                if (memoContent) {
                  const memoText = memoContent.textContent.trim();
                  // Try to extract crew details from memo text (e.g. "CPT HOWARD CONDUCTING PROGRESS CHECK FOR FO MEACHAM")
                  const cptMatch = memoText.match(/CPT\s+(\w+)/i);
                  const foMatch = memoText.match(/FO\s+(\w+)/i);
                  
                  if (cptMatch && cptMatch.length > 1) {
                    crewDetails.push({
                      position: 'CPT',
                      name: cptMatch[1],
                      id: ''
                    });
                  }
                  
                  if (foMatch && foMatch.length > 1) {
                    crewDetails.push({
                      position: 'FO',
                      name: foMatch[1],
                      id: ''
                    });
                  }
                }
              }
              
              // If no crew found in tables, look for "Acting" role information
              if (crewDetails.length === 0 && leg.crew) {
                crewDetails.push({
                  position: leg.crew,
                  name: '',
                  id: ''
                });
              }
              
              leg.crewDetails = crewDetails;
              
              flightDetails.push(leg);
            });
          }
        } else if (dutyType === 'SBY' || dutyType === 'RDO') {
          // For standby or day off, get the location
          const locationElement = card.querySelector('.detail-title-bottom .content');
          if (locationElement) {
            const location = locationElement.textContent.trim();
            flightDetails.push({ location });
          }
        } else if (dutyType.includes('TRG') || card.textContent.includes('Training')) {
          // For training duties
          const trainingElements = card.querySelectorAll('.detail-box .content');
          let trainingDetails = '';
          trainingElements.forEach(el => {
            if (el.textContent.includes('Training') || el.textContent.includes('TRG')) {
              trainingDetails += ' ' + el.textContent.trim();
            }
          });
          if (trainingDetails) {
            flightDetails.push({ training: trainingDetails.trim() });
          }
        }
        
        // If no duty type was found, try to determine from the card content
        if (!dutyType) {
          if (card.textContent.includes('SBY')) {
            dutyType = 'SBY';
          } else if (card.textContent.includes('RDO')) {
            dutyType = 'RDO';
          } else if (card.textContent.includes('FLY') || flightDetails.length > 0) {
            dutyType = 'FLY';
          }
        }
        
        // Add duty to array
        duties.push({
          day: dayOfWeek,
          date,
          dutyType,
          signOn,
          signOff,
          flightDetails,
          dutyTime,
          flightTime
        });
      } catch (error) {
        console.error('Error processing duty card:', error);
      }
    });
    
    return duties;
  } catch (error) {
    console.error('Error extracting day view data:', error);
    return [];
  }
}

// Function to extract summary data
function extractSummaryData() {
  console.log('Extracting summary data from the page');
  let stats = [];
  let summaryHTML = '';
  
  try {
    // Try to find the roster summary grid
    const rosterLeftGrid = document.querySelector('.roster-left-grid');
    
    if (rosterLeftGrid) {
      console.log('Found roster-left-grid element');
      // Extract data from each grid item
      const gridItems = rosterLeftGrid.querySelectorAll('.roster-left-grid-item');
      
      gridItems.forEach(item => {
        const valueElement = item.querySelector('.item-number');
        const labelElement = item.querySelector('.item-title');
        
        if (valueElement && labelElement) {
          const value = valueElement.textContent.trim();
          const label = labelElement.textContent.trim();
          stats.push({ label, value });
          console.log(`Found stat: ${label} = ${value}`);
        }
      });
    } else {
      console.log('roster-left-grid not found, trying alternative selectors');
      
      // Try alternative selectors if the main one fails
      const statSelectors = [
        { label: 'Duty Hours', selector: '[class*="duty-hours"], [class*="dutyhours"]' },
        { label: 'Flight Hours', selector: '[class*="flight-hours"], [class*="flighthours"]' },
        { label: 'Days Off', selector: '[class*="days-off"], [class*="daysoff"]' },
        { label: 'SBY', selector: '[class*="sby"], [class*="standby"]' },
        { label: 'Cred Hours', selector: '[class*="cred-hours"], [class*="credhours"]' },
        { label: 'Obs Hours', selector: '[class*="obs-hours"], [class*="obshours"]' },
        { label: 'Layover', selector: '[class*="layover"]' },
        { label: 'Working Duties', selector: '[class*="working-duties"], [class*="workingduties"]' },
        { label: 'Pax Hours', selector: '[class*="pax-hours"], [class*="paxhours"]' }
      ];
      
      // Try to find each stat
      statSelectors.forEach(stat => {
        const elements = document.querySelectorAll(stat.selector);
        if (elements && elements.length > 0) {
          elements.forEach(el => {
            // Try to extract the value and label
            const value = el.textContent.trim();
            stats.push({ label: stat.label, value });
            console.log(`Found stat using selector: ${stat.label} = ${value}`);
          });
        }
      });
    }
    
    // If we found stats, create a summary HTML
    if (stats.length > 0) {
      summaryHTML = '<div class="print-summary"><div class="summary-grid">';
      stats.forEach(stat => {
        summaryHTML += `
          <div class="summary-item">
            <div class="summary-value">${stat.value}</div>
            <div class="summary-label">${stat.label}</div>
          </div>
        `;
      });
      summaryHTML += '</div></div>';
    }
  } catch (error) {
    console.error('Error extracting summary data:', error);
  }
  
  return { stats, summaryHTML };
}

// Function to extract and format connection time
function extractAndFormatConnectionTime(crewText) {
  if (!crewText) return '';
  
  const conxMatch = crewText.match(/Conx[：:]\s*(\d+):(\d+)/);
  if (conxMatch) {
    return `${conxMatch[1]}:${conxMatch[2]}`;
  }
  
  return '';
}

// Function to extract acting role
function extractActingRole(crewText) {
  if (!crewText) return '';
  
  const actingMatch = crewText.match(/Acting[：:]\s*([^C]+)/);
  if (actingMatch) {
    return actingMatch[1].trim();
  }
  
  return '';
}

// Function to create compact day view HTML
function createCompactDayView(duties) {
  if (!duties || duties.length === 0) {
    return '<div class="no-duties">No duties found</div>';
  }
  
  let html = `
    <div class="compact-day-view">
      <table class="duty-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Date</th>
            <th>Duty</th>
            
            <th>Details</th>
            <th>CONX Time</th>
            <th>Block Hrs</th>
            <th>Cred Hrs</th>
            <th>Crew</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  duties.forEach(duty => {
    // Determine row color based on duty type
    let rowClass = '';
    if (duty.dutyType === 'RDO') {
      rowClass = 'duty-rdo';
    } else if (duty.dutyType === 'SBY') {
      rowClass = 'duty-sby';
    } else if (duty.dutyType.includes('FLY') || duty.flightDetails.length > 0) {
      rowClass = 'duty-fly';
    } else if (duty.dutyType === 'DHD') {
      rowClass = 'duty-dhd';
    }
    
    // Format flight details
    let detailsHtml = '';
    let flightTimeHtml = '';
    let blockHrsHtml = ''; 
    let credHrsHtml = '';
    let crewHtml = '';
    
    // Track the current crew to detect changes
    let currentCrewRole = '';
    
    if (duty.flightDetails && duty.flightDetails.length > 0) {
      duty.flightDetails.forEach((leg, index) => {
        if (index > 0) {
          detailsHtml += '<div class="flight-separator"></div>';
          flightTimeHtml += '<div class="flight-separator"></div>';
          blockHrsHtml += '<div class="flight-separator"></div>';
          credHrsHtml += '<div class="flight-separator"></div>';
        }
        
        if (leg.flightNumber) {
          // Flight leg - single line format
          detailsHtml += `<div class="flight-leg-inline">`;
          
          // Flight number and aircraft info
          detailsHtml += `<span class="flight-number">${leg.flightNumber}</span>`;
          
          if (leg.aircraftType || leg.registration) {
            let aircraft = '';
            if (leg.aircraftType && leg.registration) {
              aircraft = `${leg.aircraftType}: ${leg.registration}`;
            } else if (leg.registration) {
              aircraft = leg.registration;
            } else if (leg.aircraftType) {
              aircraft = leg.aircraftType;
            }
            detailsHtml += ` <span class="aircraft-info">${aircraft}</span>`;
          }
          
          // Route - Fix the arrival time display
          if (leg.origin && leg.destination) {
            detailsHtml += ` <span class="route-inline">${leg.origin} ${leg.departureTime || ''} → ${leg.destination} ${leg.arrivalTime || ''}</span>`;
          }
          
          detailsHtml += `</div>`;
          
          // Flight time column (connection time) - Format as requested
          const connectionTime = extractAndFormatConnectionTime(leg.crew);
          flightTimeHtml += `<div class="flight-time">${connectionTime || '-'}</div>`;
          
          // Block hours - Use actual values from the HTML if available
          blockHrsHtml += `<div class="block-hours">-</div>`;
          
          // Credit hours - Use actual values from the HTML if available
          credHrsHtml += `<div class="cred-hours">-</div>`;
          
          // Crew information in separate column - only show if it changes
          const actingRole = extractActingRole(leg.crew);
          
          // Check if crew has changed
          const crewChanged = actingRole !== currentCrewRole;
          currentCrewRole = actingRole;
          
          // Only add crew HTML if it's the first leg or the crew has changed
          if (index === 0 || crewChanged) {
            // Find crew members based on the acting role
            let crewMembersHtml = '';
            if (actingRole) {
              // Add crew members for the acting role
              crewMembersHtml += `<div class="crew-member">${actingRole}</div>`;
            } else {
              // If no acting role found, show all crew
              crewMembersHtml += `<div class="crew-member">-</div>`;
            }
            
            if (index > 0) {
              crewHtml += '<div class="flight-separator"></div>';
            }
            
            crewHtml += `<div class="crew-detail">
              ${crewChanged && index > 0 ? '<div class="crew-change-notice">Crew Change</div>' : ''}
              ${crewMembersHtml || '-'}
            </div>`;
          } else {
            // If crew hasn't changed, don't add anything to crewHtml
            // The previous crew information will span multiple legs
          }
        } else if (leg.location) {
          // Non-flight duty
          detailsHtml += `<div class="location">${leg.location}</div>`;
          flightTimeHtml += `<div class="flight-time">-</div>`;
          blockHrsHtml += `<div class="block-hours">-</div>`;
          credHrsHtml += `<div class="cred-hours">-</div>`;
          
          // Reset crew role for non-flight duties
          currentCrewRole = '';
          
          // Only add crew HTML for the first non-flight leg
          if (index === 0) {
            crewHtml += `<div class="crew-detail">-</div>`;
          }
        } else if (leg.training) {
          // Training duty
          detailsHtml += `<div class="training">${leg.training}</div>`;
          flightTimeHtml += `<div class="flight-time">-</div>`;
          blockHrsHtml += `<div class="block-hours">-</div>`;
          credHrsHtml += `<div class="cred-hours">-</div>`;
          
          // Reset crew role for training duties
          currentCrewRole = '';
          
          // Only add crew HTML for the first training leg
          if (index === 0) {
            crewHtml += `<div class="crew-detail">-</div>`;
          }
        }
      });
    } else {
      // For duties without flight details (like DHD with no legs)
      if (duty.dutyType === 'DHD') {
        detailsHtml = `<div class="dhd-duty">Deadhead Duty</div>`;
        
        // Add crew information for DHD
        crewHtml = `<div class="crew-detail">-</div>`;
        
        // Add block and credit hours for DHD if available
        blockHrsHtml = `<div class="block-hours">-</div>`;
        credHrsHtml = `<div class="cred-hours">-</div>`;
        
        flightTimeHtml = `<div class="flight-time">-</div>`;
      } else {
        detailsHtml = '';
        flightTimeHtml = '-';
        blockHrsHtml = '-';
        credHrsHtml = '-';
        crewHtml = '-';
      }
    }
    
    html += `
      <tr class="${rowClass}">
        <td>${duty.day}</td>
        <td>${duty.date}</td>
        <td>${duty.dutyType}</td>
        <td></td>
        <td></td>
        <td>${detailsHtml || ''}</td>
        <td>${flightTimeHtml || '-'}</td>
        <td>${blockHrsHtml || '-'}</td>
        <td>${credHrsHtml || '-'}</td>
        <td>${crewHtml || '-'}</td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  return html;
}

// Function to expand all flight logs
function expandAllFlightLogs() {
  return new Promise((resolve) => {
    console.log("[CREW ROSTER EXPORTER] Expanding collapsed sections to access crew information");
    
    // OPTIMIZED VERSION: Target only the specific "More" buttons with class ant-collapse-header-text
    // that trigger the Vue component's handlePanelChange event
    const moreButtons = Array.from(document.querySelectorAll('.ant-collapse-header-text'))
      .filter(el => el.textContent.trim() === 'More');
    
    console.log(`[CREW ROSTER EXPORTER] Found ${moreButtons.length} 'More' buttons that can reveal crew tables`);
    
    // Click them sequentially with a small delay
    let buttonIndex = 0;
    
    function clickNextButton() {
      if (buttonIndex < moreButtons.length) {
        console.log(`[CREW ROSTER EXPORTER] Clicking 'More' button ${buttonIndex + 1}/${moreButtons.length}`);
        try {
          moreButtons[buttonIndex].click();
          
          // Add a short delay to let the UI update
          setTimeout(() => {
            buttonIndex++;
            clickNextButton();
          }, 20); // Small delay between clicks
        } catch (e) {
          console.log(`[CREW ROSTER EXPORTER] Error clicking 'More' button: ${e.message}`);
          buttonIndex++;
          clickNextButton();
        }
      } else {
        // After clicking all buttons, extract crew tables
        console.log("[CREW ROSTER EXPORTER] Finished clicking all 'More' buttons");
        extractAndMapCrewTables();
        setTimeout(resolve, 100);
      }
    }
    
    // Start clicking buttons
    clickNextButton();
  });
}

// Function to extract crew tables and map them to flight numbers
function extractAndMapCrewTables() {
  const crewMap = new Map();
  
  // Find all tables that might contain crew information
  const tables = document.querySelectorAll('table');
  
  let crewTableCount = 0;
  
  tables.forEach((table, index) => {
    // Check if this looks like a crew table by examining its headers
    const headers = table.querySelectorAll('th');
    let isCrewTable = false;
    
    headers.forEach(header => {
      const headerText = header.textContent.trim().toLowerCase();
      if (headerText.includes('position') || headerText.includes('crew') || 
          headerText.includes('name') || headerText.includes('id')) {
        isCrewTable = true;
      }
    });
    
    if (!isCrewTable && table.className.toLowerCase().includes('crew')) {
      isCrewTable = true;
    }
    
    if (isCrewTable) {
      crewTableCount++;
      
      // Try to find the associated flight number
      let flightNumber = '';
      
      // Look in table caption if exists
      const caption = table.querySelector('caption');
      if (caption) {
        const captionText = caption.textContent.trim();
        const flightMatch = captionText.match(/\b([A-Z]{2}\d{1,4})\b/);
        if (flightMatch) {
          flightNumber = flightMatch[1];
        }
      }
      
      // If no flight number in caption, look in preceding elements
      if (!flightNumber) {
        // Look through previous siblings and their children for flight number
        let previousElement = table.previousElementSibling;
        for (let i = 0; i < 3 && previousElement; i++) {
          const text = previousElement.textContent || '';
          const flightMatch = text.match(/\b([A-Z]{2}\d{1,4})\b/);
          if (flightMatch) {
            flightNumber = flightMatch[1];
            break;
          }
          previousElement = previousElement.previousElementSibling;
        }
        
        // If still no flight number, look at parent elements
        if (!flightNumber) {
          let parent = table.parentElement;
          for (let i = 0; i < 3 && parent; i++) {
            const text = parent.textContent || '';
            const flightMatch = text.match(/\b([A-Z]{2}\d{1,4})\b/);
            if (flightMatch && !text.includes(flightMatch[1] + flightMatch[1])) { // Avoid duplicates in the text
              flightNumber = flightMatch[1];
              break;
            }
            parent = parent.parentElement;
          }
        }
      }
      
      if (!flightNumber) {
        console.log(`[CREW ROSTER EXPORTER] Could not find flight number for crew table ${index}`);
        flightNumber = `unknown_${index}`;
      }
      
      // Extract crew information from table
      const crew = [];
      const rows = table.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          let position = '';
          let name = '';
          let id = '';
          
          // Different tables might have different column orders
          // Try to identify columns by their content
          
          for (let i = 0; i < cells.length; i++) {
            const cellText = cells[i].textContent.trim();
            
            // Position is usually short like CPT, FO, CM
            if (cellText.match(/^(CPT|FO|CM|FA|CA|CCM)\b/) && !position) {
              position = cellText;
            }
            // ID numbers usually have specific patterns
            else if (cellText.match(/^\d{4,}$/) && !id) {
              id = cellText;
            }
            // Names usually have spaces and are longer
            else if (cellText.includes(' ') && cellText.length > 4 && !name) {
              name = cellText;
            }
            // If we can't identify by content, use position
            else if (i === 0 && !position) {
              position = cellText;
            }
            else if (i === 1 && !name) {
              name = cellText;
            }
            else if (i === 2 && !id) {
              id = cellText;
            }
          }
          
          if (position || name) {
            crew.push({ position, name, id });
          }
        }
      });
      
      if (crew.length > 0) {
        console.log(`[CREW ROSTER EXPORTER] Extracted ${crew.length} crew members for flight ${flightNumber}`);
        crewMap.set(flightNumber, crew);
      }
    }
  });
  
  console.log(`[CREW ROSTER EXPORTER] Found ${crewTableCount} crew tables containing ${crewMap.size} flight crew lists`);
  window.crewInfoMap = crewMap; // Store for use in duty data extraction
  return crewMap;
}

// Function to extract duty data
function extractDutyData() {
  console.log("[CREW ROSTER EXPORTER] Extracting duty data from the roster page");
  
  return new Promise((resolve) => {
    // First expand all flight logs to access crew information
    expandAllFlightLogs().then(() => {
      let duties = [];
      
      try {
        // Try to find duty cards
        const dutyCards = document.querySelectorAll('.duty-card');
        console.log(`[CREW ROSTER EXPORTER] Found ${dutyCards.length} duty cards`);
        
        if (!dutyCards || dutyCards.length === 0) {
          console.error('[CREW ROSTER EXPORTER] No duty cards found in the page');
          resolve(duties);
          return;
        }
        
        // Process each duty card
        dutyCards.forEach((card, index) => {
          console.log(`[CREW ROSTER EXPORTER] Processing duty card ${index}:`, card);
          
          try {
            // Extract date from the card
            const dateElement = card.querySelector('.duty-date div');
            const date = dateElement ? dateElement.textContent.trim() : '';
            
            // Extract duty time
            const dutyTimeElement = card.querySelector('.duty-time');
            const dutyTime = dutyTimeElement ? dutyTimeElement.textContent.trim() : '';
            
            // Parse sign on and sign off times from duty time
            let signOn = '';
            let signOff = '';
            
            if (dutyTime) {
              const timeMatch = dutyTime.match(/(\d{2}:\d{2})\(L\)\s*~\s*.*?(\d{2}:\d{2})\(L\)/);
              if (timeMatch && timeMatch.length > 2) {
                signOn = timeMatch[1];
                signOff = timeMatch[2];
              } else {
                // Try different format
                const altTimeMatch = dutyTime.match(/\d{2}-\w{3}-\d{4}\s+(\d{2}:\d{2})\(L\)\s*~\s*.*?(\d{2}:\d{2})\(L\)/);
                if (altTimeMatch && altTimeMatch.length > 2) {
                  signOn = altTimeMatch[1];
                  signOff = altTimeMatch[2];
                }
              }
            }
            
            // Find the assignment type element - this defines the duty type (FLY, DHD, SBY, RDO, etc.)
            let dutyType = '';
            const assignmentTypeElement = card.querySelector('.assignment-type');
            
            if (assignmentTypeElement) {
              // Extract the duty type text, trim whitespace
              dutyType = assignmentTypeElement.textContent.trim();
            }
            
            // If no duty type found, look for flight info to determine if it's a FLY or DHD
            if (!dutyType) {
              const flightInfo = card.querySelector('.info-middle-box');
              dutyType = flightInfo ? 'FLY' : 'UNK'; // Default to 'UNK' (unknown) if can't determine
            }
            
            console.log(`[CREW ROSTER EXPORTER] Extracted duty card ${index}: Date=${date}, Type=${dutyType}, Sign On=${signOn}, Sign Off=${signOff}`);
            
            // Extract flight details if this is a flight duty
            let flightDetails = [];
            
            // Process DHD and FLY duties
            const infoElements = card.querySelectorAll('.info-detail');
            console.log(`[CREW ROSTER EXPORTER] Found ${infoElements.length} info details sections`);
            
            // Even non-flight duties should be added to the duty data
            const existingDayIndex = duties.findIndex(item => item.date === date);
            
            if (existingDayIndex !== -1) {
              // Day already exists, add this duty to that day
              duties[existingDayIndex].duties.push({
                dutyType,
                signOn,
                signOff,
                flightDetails
              });
              console.log(`[CREW ROSTER EXPORTER] Added duty of type ${dutyType} to existing day ${date}`);
            } else {
              // Create a new day entry
              duties.push({
                date,
                duties: [{
                  dutyType,
                  signOn,
                  signOff,
                  flightDetails
                }]
              });
              console.log(`[CREW ROSTER EXPORTER] Created new day ${date} with duty of type ${dutyType}`);
            }
            
            // If there are flight/duty details, extract them
            if (infoElements.length > 0) {
              infoElements.forEach((infoDetail, legIndex) => {
                try {
                  // Check if this is a flight leg by looking for assignment type
                  const legAssignmentTypeElement = infoDetail.querySelector('.assignment-type');
                  let legType = '';
                  
                  if (legAssignmentTypeElement) {
                    // Extract the leg type text and trim whitespace - accept ANY duty type, not just predefined ones
                    legType = legAssignmentTypeElement.textContent.trim();
                  } else {
                    // Default to the parent duty type if no specific leg type found
                    legType = dutyType;
                  }
                  
                  console.log(`[CREW ROSTER EXPORTER] Processing leg ${legIndex}, type: ${legType}`);
                  
                  // Extract flight details for any leg type, not just FLY or DHD
                  // Extract departure location and time
                  const depLocationElement = infoDetail.querySelector('.info-start .info-start-location');
                  const depTimeElement = infoDetail.querySelector('.info-start .info-start-time');
                  
                  // Extract flight details from middle box
                  const flightNumberElement = infoDetail.querySelector('.info-middle-box .info-middle-top div:first-child');
                  
                  // Aircraft type (F100, F70, etc.) is the 3rd div in middle box
                  const aircraftTypeElement = infoDetail.querySelector('.info-middle-box .info-middle-top div:nth-child(3)');
                  
                  // Aircraft registration is the 5th div in middle box
                  const aircraftRegElement = infoDetail.querySelector('.info-middle-box .info-middle-top div:nth-child(5)');
                  
                  // Extract crew role and connection time
                  let roleElement = null;
                  let connxElement = null;
                  
                  // Find the elements containing "Acting" and "Conx" text
                  const middleTopDivs = infoDetail.querySelectorAll('.info-middle-top div');
                  if (middleTopDivs) {
                    middleTopDivs.forEach(div => {
                      const text = div.textContent.trim();
                      if (text.includes('Acting')) {
                        roleElement = div;
                      } else if (text.includes('Conx')) {
                        connxElement = div;
                      }
                    });
                  }
                  
                  // Extract assignment type for this specific flight leg - don't assume it's one of predefined types
                  let legDutyType = legType || dutyType; // Default to leg type or parent duty type if leg type not found
                  
                  // Extract arrival location and time
                  const arrLocationElements = infoDetail.querySelectorAll('.info-start .info-start-location');
                  const arrTimeElements = infoDetail.querySelectorAll('.info-start .info-start-time');
                  
                  const arrLocationElement = arrLocationElements.length > 1 ? arrLocationElements[1] : null;
                  const arrTimeElement = arrTimeElements.length > 1 ? arrTimeElements[1] : null;
                  
                  // Get values
                  const departure = depLocationElement ? depLocationElement.textContent.trim() : '';
                  const depTime = depTimeElement ? depTimeElement.textContent.trim() : '';
                  
                  const flightNumber = flightNumberElement ? flightNumberElement.textContent.trim() : '';
                  
                  // Get aircraft info
                  let aircraftType = '';
                  let aircraftReg = '';
                  const aircraftDivs = infoDetail.querySelectorAll('.info-middle-top div');
                  aircraftDivs.forEach(div => {
                    const text = div.textContent.trim();
                    if (/^(F70|F100|E190|B738|B737|B717|A320|A321|B39M|B38M|B789|B788|B777|B787|A330|A350|A380|B767|B747|B757|B727|B737-800|B737-700|B737-300|B737-400|B737-500)$/.test(text)) {
                      aircraftType = text;
                    }
                    if (/^VH[A-Z0-9]+$/.test(text)) {
                      aircraftReg = text;
                    }
                  });
                  let aircraft = '';
                  if (aircraftType && aircraftReg) {
                    aircraft = `${aircraftType}: ${aircraftReg}`;
                  } else if (aircraftReg) {
                    aircraft = aircraftReg;
                  } else if (aircraftType) {
                    aircraft = aircraftType;
                  }
                  
                  const arrival = arrLocationElement ? arrLocationElement.textContent.trim() : '';
                  const arrTime = arrTimeElement ? arrTimeElement.textContent.trim() : '';
                  
                  // Extract connection time
                  let connxTime = '';
                  if (connxElement) {
                    const connxMatch = connxElement.textContent.match(/Conx[：:]\s*(\d+):(\d+|\d+)/);
                    connxTime = connxMatch && connxMatch.length > 1 ? connxMatch[1] + ':' + connxMatch[2] : '';
                  }
                  
                  // Extract crew role
                  let crew = '';
                  if (roleElement) {
                    const roleMatch = roleElement.textContent.match(/Acting[：:]\s*([^C]+)/);
                    crew = roleMatch && roleMatch.length > 1 ? roleMatch[1] : '';
                  }
                  
                  // Extract detailed crew information
                  let crewDetails = [];
                  
                  // Try to get crew from the global crew map first (by flight number)
                  if (window.crewInfoMap && window.crewInfoMap.has(flightNumber)) {
                    crewDetails = window.crewInfoMap.get(flightNumber);
                    console.log(`[CREW ROSTER EXPORTER] Using mapped crew info for ${flightNumber}: ${crewDetails.length} crew members`);
                    crew = formatCrewDetails(crewDetails);
                  } else {
                    // When the extension processes the page normally, the crew tables are hidden
                    // We need to look inside collapsed content sections
                    
                    // First, look for any ant-table-tbody regardless of visibility
                    const allCrewTables = infoDetail.querySelectorAll('.ant-table-tbody');
                    if (allCrewTables && allCrewTables.length > 0) {
                      allCrewTables.forEach(table => {
                        // Even if the table is inside a hidden section, we can still extract its content
                        const crewRows = table.querySelectorAll('.ant-table-row');
                        crewRows.forEach(row => {
                          const cells = row.querySelectorAll('.ant-table-cell');
                          if (cells.length >= 3) {
                            const position = cells[0].textContent.trim();
                            const name = cells[1].textContent.trim();
                            const id = cells[2].textContent.trim();
                            
                            if (position && (name || id)) {
                              crewDetails.push({
                                position,
                                name,
                                id
                              });
                            }
                          }
                        });
                      });
                    }
                    
                    // Look for memo content that might contain crew information
                    if (crewDetails.length === 0) {
                      const memoContent = infoDetail.querySelector('.expand-content-memo .content');
                      if (memoContent) {
                        const memoText = memoContent.textContent.trim();
                        // Try to extract crew details from memo text (e.g. "CPT HOWARD CONDUCTING PROGRESS CHECK FOR FO MEACHAM")
                        const cptMatch = memoText.match(/CPT\s+(\w+)/i);
                        const foMatch = memoText.match(/FO\s+(\w+)/i);
                        
                        if (cptMatch && cptMatch.length > 1) {
                          crewDetails.push({
                            position: 'CPT',
                            name: cptMatch[1],
                            id: ''
                          });
                        }
                        
                        if (foMatch && foMatch.length > 1) {
                          crewDetails.push({
                            position: 'FO',
                            name: foMatch[1],
                            id: ''
                          });
                        }
                      }
                    }
                    
                    // If no crew found in tables, look for "Acting" role information
                    if (crewDetails.length === 0 && crew) {
                      crewDetails.push({
                        position: crew,
                        name: '',
                        id: ''
                      });
                    }
                  }
                  
                  // Calculate block hours (difference between arrival and departure times)
                  let blockHours = '';
                  if (depTime && arrTime) {
                    const depTimeParts = depTime.replace(' L', '').split(':');
                    const arrTimeParts = arrTime.replace(' L', '').split(':');
                    
                    if (depTimeParts.length === 2 && arrTimeParts.length === 2) {
                      const depMinutes = parseInt(depTimeParts[0]) * 60 + parseInt(depTimeParts[1]);
                      const arrMinutes = parseInt(arrTimeParts[0]) * 60 + parseInt(arrTimeParts[1]);
                      
                      // Handle crossing midnight
                      let diffMinutes = arrMinutes - depMinutes;
                      if (diffMinutes < 0) {
                        diffMinutes += 24 * 60;
                      }
                      
                      const hours = Math.floor(diffMinutes / 60);
                      const minutes = diffMinutes % 60;
                      
                      blockHours = `${hours}:${minutes.toString().padStart(2, '0')}`;
                    }
                  }
                  
                  // Add flight detail to the last duty of the current day
                  const dayIndex = duties.findIndex(item => item.date === date);
                  if (dayIndex !== -1 && duties[dayIndex].duties.length > 0) {
                    const lastDutyIndex = duties[dayIndex].duties.length - 1;
                    duties[dayIndex].duties[lastDutyIndex].flightDetails.push({
                      flightNumber,
                      departure,
                      arrival,
                      depTime, // Store the original departure time
                      arrTime, // Store the original arrival time
                      blockHours,
                      creditHours: blockHours, // Assuming credit hours = block hours
                      connxTime,
                      crew,
                      legDutyType, // Store the leg-specific duty type
                      aircraftType,
                      aircraftReg,
                      crewDetails
                    });
                    
                    console.log(`[CREW ROSTER EXPORTER] Added flight leg ${legIndex} to day ${date}:`, { 
                      flightNumber, 
                      departure, 
                      arrival, 
                      blockHours, 
                      crew, 
                      legDutyType 
                    });
                  }
                } catch (error) {
                  console.error(`[CREW ROSTER EXPORTER] Error extracting flight leg ${legIndex}:`, error);
                }
              });
            }
          } catch (error) {
            console.error(`[CREW ROSTER EXPORTER] Error processing duty card ${index}:`, error);
          }
        });
        
        console.log("[CREW ROSTER EXPORTER] Completed extraction of duty data:", duties);
        resolve(duties);
      } catch (error) {
        console.error("[CREW ROSTER EXPORTER] Error extracting duty data:", error);
        resolve([]);
      }
    });
  });
}

// Function to generate day view HTML
function generateDayViewHTML(dutyData) {
  console.log('[CREW ROSTER EXPORTER] Generating day view HTML from duty data', dutyData);
  
  if (!dutyData || dutyData.length === 0) {
    console.error('[CREW ROSTER EXPORTER] No duty data available');
    return `
      <div class="no-data-container">
        <div class="no-data">
          <h3>No Duty Data Available</h3>
          <p>The extension couldn't find any duty information on this page.</p>
          <p>Please ensure you're viewing a valid roster page.</p>
        </div>
      </div>
    `;
  }
  
  let html = `
    <table class="day-view-table">
      <thead>
        <tr>
          <th>Day</th>
          <th>Date</th>
          <th>Duty</th>
          <th>Details</th>
          <th>CONX Time</th>
          <th>Block Hrs</th>
          <th>Cred Hrs</th>
          <th>Crew</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Keep track of the current day of the week
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let currentDayIndex = 0;
  let previousDate = '';
  
  // Process each duty
  dutyData.forEach((duty, index) => {
    const { date, duties } = duty;
    
    // Try to determine day of week from date
    let dayOfWeek = '';
    if (date) {
      // Try to parse the date to get day of week
      try {
        // Check if date is in format "DD-MMM-YYYY"
        const dateMatch = date.match(/(\d{1,2})-(\w{3})-(\d{4})/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const monthStr = dateMatch[2].toLowerCase();
          const year = parseInt(dateMatch[3]);
          
          // Map month abbreviation to month number (0-based)
          const monthMap = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
          };
          
          const month = monthMap[monthStr];
          if (month !== undefined) {
            const dateObj = new Date(year, month, day);
            dayOfWeek = daysOfWeek[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1]; // Convert 0-6 (Sun-Sat) to 0-6 (Mon-Sun)
          }
        }
      } catch (e) {
        console.error('[CREW ROSTER EXPORTER] Error parsing date:', e);
      }
    }
    
    // If we couldn't determine day of week, use the rotation
    if (!dayOfWeek) {
      dayOfWeek = daysOfWeek[currentDayIndex];
      currentDayIndex = (currentDayIndex + 1) % 7;
    }
    
    // Check if this is a new date - if so, insert a day separator
    const isNewDate = date !== previousDate;
    if (isNewDate && index > 0) {
      html += `
        <tr class="day-separator">
          <td colspan="8"></td>
        </tr>
      `;
    }
    previousDate = date;
    
    // Process each duty for the date
    duties.forEach(duty => {
      const { dutyType, signOn, signOff, flightDetails } = duty;
      
      // Convert duty type to lowercase for CSS classes
      const dutyTypeClass = dutyType.toLowerCase();
      
      // If this is a duty with flight details
      if (flightDetails && flightDetails.length > 0) {
        // Track previous crew for change detection
        let previousCrew = '';
        
        // Create a day header row with day/date included on the same line
        html += `
          <tr class="day-header ${dutyTypeClass}-header">
            <td class="day-column">${dayOfWeek}</td>
            <td class="date-column">${date}</td>
            <td colspan="6">
              <div class="day-summary">
                <span class="duty-type-badge">${dutyType}</span>
                <span class="duty-times">Sign On: ${signOn} | Sign Off: ${signOff}</span>
              </div>
            </td>
          </tr>
        `;
        
        // Process each flight leg
        flightDetails.forEach((flight, flightIndex) => {
          const { flightNumber, departure, arrival, depTime, arrTime, aircraft, blockHours, creditHours, connxTime, crew, legDutyType, aircraftType, aircraftReg, crewDetails } = flight;
          console.log(`[CREW ROSTER EXPORTER] Processing flight leg ${flightIndex}:`, flight);
          
          // Get the appropriate duty type for this leg (may differ from parent duty)
          const actualDutyType = legDutyType || dutyType;
          const actualDutyTypeClass = actualDutyType.toLowerCase();
          
          // Format flight details in the requested format: "VA1255 -- 07:28L BNE - EMD 08:57L -- F70: VHNUO"
          // Extract departure and arrival times
          const depTimeStr = depTime ? depTime.replace(' L', '') : '';
          const arrTimeStr = arrTime ? arrTime.replace(' L', '') : '';
          
          // Format details with the specific format requested
          const details = flightNumber ? 
            `${flightNumber} -- ${depTimeStr}L ${departure} - ${arrival} ${arrTimeStr}L -- ${aircraftType && aircraftReg ? `${aircraftType}: ${aircraftReg}` : aircraftReg || aircraftType}` : 
            `${departure || ''} - ${arrival || ''}`;
          
          // Check if crew changed
          const currentCrew = crew || '';
          const hasCrewDetails = crewDetails && crewDetails.length > 0;
          
          // Generate a unique crew signature for comparison
          let currentCrewSignature = '';
          if (hasCrewDetails) {
            currentCrewSignature = crewDetails.map(d => `${d.position}:${d.name}:${d.id}`).join('|');
          } else {
            currentCrewSignature = currentCrew;
          }
          
          const crewChanged = previousCrew !== '' && currentCrewSignature !== previousCrew && currentCrewSignature !== '';
          
          // Store current crew signature for next comparison
          previousCrew = currentCrewSignature;
          
          // Only show crew on first leg of the day or when crew changes
          const showCrew = flightIndex === 0 || crewChanged;
          
          // Create row
          html += `
            <tr class="${actualDutyTypeClass} flight-detail-row ${crewChanged ? 'crew-change' : ''}">
              <td></td>
              <td></td>
              <td><span class="mini-badge">${actualDutyType}</span></td>
              <td>${details}</td>
              <td>${connxTime || ''}</td>
              <td>${blockHours || ''}</td>
              <td>${creditHours || ''}</td>
              <td>
                ${crewChanged && flightIndex > 0 ? '<span class="crew-change-indicator">Crew Change</span>' : ''}
                ${showCrew ? (
                  hasCrewDetails 
                    ? crewDetails.map(detail => `<div class="crew-member">${detail.position}: ${detail.name} (${detail.id})</div>`).join('') 
                    : crew ? `<div class="crew-member">Acting: ${crew}</div>` : ''
                ) : ''}
              </td>
            </tr>
          `;
        });
      } else {
        // Non-flight duty
        // Generate a descriptive text based on duty type
        let dutyDescription = '';
        
        // Common duty types
        switch (dutyType) {
          case 'RDO':
            dutyDescription = 'Rest Day Off';
            break;
          case 'SBY':
            dutyDescription = 'Standby';
            break;
          case 'DHD':
            dutyDescription = 'Deadhead';
            break;
          case 'FLY':
            dutyDescription = 'Flight Duty';
            break;
          case 'TRG':
            dutyDescription = 'Training';
            break;
          case 'SIM':
            dutyDescription = 'Simulator';
            break;
          case 'OFD':
            dutyDescription = 'Office Duty';
            break;
          case 'GND':
            dutyDescription = 'Ground Duty';
            break;
          default:
            dutyDescription = dutyType; // Use the duty type as description for unknown types
        }
        
        // Add day and date to the same line as the duty information
        html += `
          <tr class="${dutyTypeClass}-header">
            <td class="day-column">${dayOfWeek}</td>
            <td class="date-column">${date}</td>
            <td colspan="6">
              <div class="day-summary">
                <span class="duty-type-badge">${dutyType}</span>
                <span class="duty-times">Sign On: ${signOn} | Sign Off: ${signOff}</span>
                <span class="duty-description">${dutyDescription}</span>
              </div>
            </td>
          </tr>
        `;
      }
    });
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  return html;
}

// Function to extract calendar HTML
function extractCalendarHTML() {
  console.log('[CREW ROSTER EXPORTER] Extracting calendar HTML');
  try {
    // Try to find the calendar element
    const calendarElement = document.querySelector('.roster-left, .calendar-grid, [class*="calendar"]');
    
    if (calendarElement) {
      console.log('[CREW ROSTER EXPORTER] Found calendar element');
      
      // Create a deep clone to avoid modifying the original
      const calendarClone = calendarElement.cloneNode(true);
      
      // RESTRUCTURING APPROACH: Extract summary data and calendar grid separately
      let summaryData = '';
      
      // Extract the bottom summary data (hours, counts, etc.)
      const summaryElements = calendarClone.querySelectorAll('.summary, [class*="summary"], [class*="footer"], [class*="bottom-section"], [class*="roster-stats"]');
      summaryElements.forEach(element => {
        // Save the content before removing
        summaryData += element.outerHTML;
        // Remove from original position
        element.remove();
      });
      
      // Remove the giant "Calendar Period" title
      const largeTextElements = calendarClone.querySelectorAll('h1, h2, h3, h4, h5, h6, [style*="font-size"], [class*="title"], [class*="heading"]');
      largeTextElements.forEach(element => {
        const text = element.textContent.toLowerCase();
        if (text.includes('calendar') || text.includes('period') || text.includes('roster')) {
          console.log('[CREW ROSTER EXPORTER] Removing large text element:', element.textContent);
          element.remove();
        }
      });
      
      // Clean up the calendar clone (remove buttons, controls, and other unwanted elements)
      const elementsToRemove = calendarClone.querySelectorAll('button, input, select, .no-print, [class*="control"], [class*="button"]');
      elementsToRemove.forEach(element => element.remove());
      
      // Create a wrapper and insert the summary data in a compact format at the top
      let result = `
        <div class="calendar-with-summary">
          <div class="compact-summary">
            ${summaryData}
          </div>
          <div class="calendar-wrapper">
            ${calendarClone.outerHTML}
          </div>
        </div>
      `;
      
      return result;
    } else {
      console.error('[CREW ROSTER EXPORTER] Calendar element not found');
      return '';
    }
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error extracting calendar HTML:', error);
    return '';
  }
}

// Function to open print window with extracted content
function openPrintWindow(calendarHtml, dayViewHtml, view) {
  console.log('[CREW ROSTER EXPORTER] Opening print window with view:', view);
  
  // Extract date range and summary
  const dateRange = extractDateRange();
  const { summaryHTML } = extractSummaryData();
  
  // Determine page orientation based on view type
  let pageOrientation = 'portrait';  // Default
  
  if (view === 'calendar') {
    pageOrientation = 'landscape';  // Calendar view uses landscape
  } else if (view === 'both') {
    // For combined view, we'll use different orientations for each section with page breaks
    // The main container will be portrait orientation
    pageOrientation = 'portrait';
  }
  
  // Style for different views
  const stylesByView = {
    calendar: `
      @page {
        size: A4 landscape;
        margin: 0.5cm;
      }
      body {
        font-size: 10pt;
      }
      
      /* View-specific print styles */
      
    `,
    day: `
      @page {
        size: A4 portrait;
        margin: 0.5cm;
      }
      body {
        font-size: 11pt;
      }
      
      /* View-specific print styles */
      
    `,
    both: `
      @page {
        size: A4 portrait;
        margin: 0.5cm;
      }
      
      @page :first {
        size: A4 landscape;
        margin: 0.5cm;
      }
      
      body {
        font-size: 11pt;
      }
      
      .calendar-view {
        page-break-after: always;
      }
      
      /* View-specific print styles */
      
    `
  };
  
  const extraStyles = `
    /* Extra styles for specific views */
    
  `;
  
  // Prepare HTML content
  let htmlContent = `
    <div class="print-container">
      <div class="date-title-bar">
        <span class="date-range">${dateRange}</span>
      </div>
  
      <div class="roster-summary">
        <div class="summary-title">Roster Summary</div>
        <div class="print-summary">${summaryHTML}</div>
      </div>
    `;
  
  // Add calendar view if selected
  if (view === 'calendar' || view === 'both') {
    if (calendarHtml) {
      htmlContent += `
        <div class="calendar-view">
          ${calendarHtml}
        </div>
      `;
    } else {
      console.error('[CREW ROSTER EXPORTER] Failed to extract calendar view');
    }
  }
  
  // Add day view if selected
  if (view === 'day' || view === 'both') {
    if (dayViewHtml) {
      if (view === 'day' || view === 'both') {
        htmlContent += `
          <div class="print-title">Day View</div>
        `;
      }
        
      htmlContent += `  
        <div class="day-view">
          ${dayViewHtml}
        </div>
      `;
    } else {
      console.error('[CREW ROSTER EXPORTER] Failed to extract duty data');
      htmlContent += `
        <div class="day-view">
          <div class="error-message">
            <h3>No Duty Data Found</h3>
            <p>The extension couldn't find any duty information on this page.</p>
            <p>Please ensure you're viewing a valid roster page.</p>
          </div>
        </div>
      `;
    }
  }
  
  htmlContent += `
    </div>
    <div class="print-controls">
      <button class="print-button" onclick="window.print()">Print</button>
      <button class="close-button" onclick="window.close()">Close</button>
    </div>
  `;
  
  // Enhanced print preview navbar styles
  const printPreviewNavbarStyles = `
    /* Print preview navbar styles */
    .print-preview-navbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: rgba(25, 118, 210, 0.9);
      backdrop-filter: blur(5px);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10000;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
      font-family: Arial, sans-serif;
    }
    
    .navbar-title {
      color: white;
      font-size: 16px;
      font-weight: bold;
    }
    
    .navbar-buttons {
      display: flex;
      gap: 12px;
    }
    
    .navbar-button {
      background-color: white;
      color: #1976d2;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .navbar-button:hover {
      background-color: #f5f5f5;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    
    .navbar-button:active {
      transform: translateY(0);
    }
    
    .print-button {
      background-color: #2196f3;
      color: white;
    }
    
    .print-button:hover {
      background-color: #1976d2;
    }
    
    /* Hide navbar when printing */
    @media print {
      .print-preview-navbar {
        display: none !important;
      }
      
      /* Remove any margins/padding added for the navbar */
      body {
        padding-bottom: 0 !important;
        margin-bottom: 0 !important;
      }
    }
  `;
  
  // Open a new window and write content
  const printWindow = window.open('about:blank', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>Crew Roster Print</title>
      <link rel="icon" href="${chrome.runtime.getURL('icon-16.png')}" type="image/png">
      <link rel="stylesheet" href="${chrome.runtime.getURL('content/styles.css')}">
      <style>
        ${stylesByView[view] || ''}
        ${extraStyles}
        ${printPreviewNavbarStyles}
      </style>
    </head>
    <body>
      ${htmlContent}
      
      <!-- New enhanced print preview navbar -->
      <div class="print-preview-navbar">
        <span class="navbar-title">Crew Roster Exporter</span>
        <div class="navbar-buttons">
          <button class="navbar-button print-button" onclick="window.print()">Print ${view.charAt(0).toUpperCase() + view.slice(1)} View</button>
          <button class="navbar-button close-button" onclick="window.close()">Close Window</button>
        </div>
      </div>
      
      <script>
        // Add padding to the bottom of the body to prevent content from being hidden under the navbar
        document.body.style.paddingBottom = '60px';
        
        // Make sure print dialog opens automatically (not working in all browsers due to security)
        // setTimeout(() => window.print(), 1000);
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
}

// Main function to print the roster
function printRoster(view) {
  console.log(`[CREW ROSTER EXPORTER] Printing roster with view: ${view}`);
  
  try {
    let calendarHtml = '';
    let dayViewHtml = '';
    
    if (view === 'calendar' || view === 'both') {
      // Extract calendar HTML from the roster-left-grid
      calendarHtml = extractCalendarHTML();
    }
    
    if (view === 'day' || view === 'both') {
      // Extract duty data and generate day view
      extractDutyData().then(dutyData => {
        dayViewHtml = generateDayViewHTML(dutyData);
        
        // Create a new window with the chosen view(s)
        openPrintWindow(calendarHtml, dayViewHtml, view);
      });
    } else {
      // For calendar-only view, open print window immediately
      openPrintWindow(calendarHtml, dayViewHtml, view);
    }
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error in printRoster:', error);
    alert('There was an error processing the roster. Please check console for details.');
  }
}

// Function to extract date range
function extractDateRange() {
  console.log('[CREW ROSTER EXPORTER] Extracting date range from the page');
  try {
    // Try to find the date range element
    const dateRangeElement = document.querySelector('.roster-period, .ant-select-selection-item, [class*="roster-period"], [class*="date-range"]');
    
    if (dateRangeElement) {
      const dateRange = dateRangeElement.textContent.trim();
      console.log('[CREW ROSTER EXPORTER] Found date range:', dateRange);
      return dateRange;
    }
    
    // If we couldn't find a specific date range element, try to find month/year indicators
    const monthElement = document.querySelector('[class*="month-indicator"], [class*="year-indicator"], .month, .year');
    if (monthElement) {
      const monthYear = monthElement.textContent.trim();
      console.log('[CREW ROSTER EXPORTER] Found month/year:', monthYear);
      return monthYear;
    }
    
    // If all else fails, extract from the first day element
    const firstDayElement = document.querySelector('[class*="day-number"], [class*="date-number"]');
    const lastDayElement = document.querySelectorAll('[class*="day-number"], [class*="date-number"]');
    
    if (firstDayElement && lastDayElement.length > 0) {
      const firstDay = firstDayElement.textContent.trim();
      const lastDay = lastDayElement[lastDayElement.length - 1].textContent.trim();
      
      // Try to find month elements
      const monthElements = document.querySelectorAll('[class*="month-name"], [class*="month-label"]');
      let monthText = '';
      
      if (monthElements.length > 0) {
        monthText = monthElements[0].textContent.trim();
      }
      
      const dateRange = `${firstDay} - ${lastDay} ${monthText}`;
      console.log('[CREW ROSTER EXPORTER] Constructed date range:', dateRange);
      return dateRange;
    }
    
    // Default fallback
    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long' });
    const year = today.getFullYear();
    return `${month} ${year}`;
    
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error extracting date range:', error);
    return 'Roster Period';
  }
}

// Function to generate Google Calendar export data
function generateGoogleCalendarEvents(dutyData) {
  console.log('[CREW ROSTER EXPORTER] Generating Google Calendar events');
  
  if (!dutyData || dutyData.length === 0) {
    console.error('[CREW ROSTER EXPORTER] No duty data available for calendar export');
    return [];
  }
  
  const calendarEvents = [];
  
  // Process each day's duties
  dutyData.forEach(dutyDay => {
    const { date, duties } = dutyDay;
    
    // Process each duty for this day
    duties.forEach(duty => {
      const { dutyType, signOn, signOff, flightDetails } = duty;
      
      try {
        // Parse the date string (assuming format DD-MMM-YYYY)
        const dateParts = date.match(/(\d{1,2})-(\w{3})-(\d{4})/);
        if (!dateParts) {
          console.error(`[CREW ROSTER EXPORTER] Cannot parse date: ${date}`);
          return;
        }
        
        const day = parseInt(dateParts[1]);
        const monthStr = dateParts[2].toLowerCase();
        const year = parseInt(dateParts[3]);
        
        // Map month abbreviation to month number (0-based)
        const monthMap = {
          'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
          'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };
        
        const month = monthMap[monthStr];
        if (month === undefined) {
          console.error(`[CREW ROSTER EXPORTER] Invalid month: ${monthStr}`);
          return;
        }
        
        // Parse sign-on and sign-off times
        let signOnTime, signOffTime;
        let signOnFormatted = '', signOffFormatted = '';
        
        if (signOn && signOn.includes(':')) {
          const [hours, minutes] = signOn.split(':').map(n => parseInt(n));
          signOnTime = new Date(year, month, day, hours, minutes);
          // Format for title: "HHMM"
          signOnFormatted = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
        } else {
          console.error(`[CREW ROSTER EXPORTER] Invalid sign-on time: ${signOn}`);
          return;
        }
        
        if (signOff && signOff.includes(':')) {
          const [hours, minutes] = signOff.split(':').map(n => parseInt(n));
          signOffTime = new Date(year, month, day, hours, minutes);
          // Format for title: "HHMM"
          signOffFormatted = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
          
          // If sign-off time is earlier than sign-on time, it's likely the next day
          if (signOffTime < signOnTime) {
            signOffTime.setDate(signOffTime.getDate() + 1);
          }
        } else {
          console.error(`[CREW ROSTER EXPORTER] Invalid sign-off time: ${signOff}`);
          return;
        }
        
        // Extract unique destinations for the title
        const destinations = new Set();
        if (flightDetails && flightDetails.length > 0) {
          flightDetails.forEach(flight => {
            if (flight.departure) destinations.add(flight.departure);
            if (flight.destination || flight.arrival) destinations.add(flight.destination || flight.arrival);
          });
        }
        
        // Create event title: Time range followed by duty type and unique destinations
        const destinationsArray = Array.from(destinations);
        const timeRange = `${signOnFormatted}-${signOffFormatted}`;
        const title = `${timeRange} ${dutyType} ${destinationsArray.join(' ')}`;
        
        // Create detailed description with all flight information
        let description = `Duty Type: ${dutyType}\nSign On: ${signOn}\nSign Off: ${signOff}\n\n`;
        
        if (flightDetails && flightDetails.length > 0) {
          description += "Flight Details:\n";
          flightDetails.forEach((flight, index) => {
            const { flightNumber, departure, arrival, depTime, arrTime, aircraft, blockHours, creditHours } = flight;
            description += `${index + 1}. ${flightNumber || 'N/A'} - ${departure || ''} to ${arrival || ''}\n`;
            description += `   Depart: ${depTime || 'N/A'}, Arrive: ${arrTime || 'N/A'}\n`;
            description += `   Aircraft: ${aircraft || 'N/A'}\n`;
            if (blockHours) description += `   Block: ${blockHours}\n`;
            if (creditHours) description += `   Credit: ${creditHours}\n`;
            
            // Add crew information if available
            if (flight.crewDetails && flight.crewDetails.length > 0) {
              description += "   Crew:\n";
              flight.crewDetails.forEach(crew => {
                description += `     ${crew.position}: ${crew.name} (${crew.id})\n`;
              });
            }
            description += "\n";
          });
        }
        
        // Format dates for Google Calendar URL
        const formatDateForGCal = (date) => {
          return date.toISOString().replace(/-|:|\.\d+/g, '');
        };
        
        // Create calendar event object
        const event = {
          title: title,
          description: description,
          start: formatDateForGCal(signOnTime),
          end: formatDateForGCal(signOffTime),
          rawDate: date,
          rawSignOn: signOn,
          rawSignOff: signOff
        };
        
        calendarEvents.push(event);
        
      } catch (error) {
        console.error(`[CREW ROSTER EXPORTER] Error creating calendar event for ${date}:`, error);
      }
    });
  });
  
  return calendarEvents;
}

// Function to create Google Calendar URL
function createGoogleCalendarUrl(event) {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const action = 'TEMPLATE';
  
  const params = new URLSearchParams({
    action: action,
    text: event.title,
    dates: `${event.start}/${event.end}`,
    details: event.description
  });
  
  return `${baseUrl}?${params.toString()}`;
}

// Function to download events as a single ICS file
function generateICSFile(events) {
  // ICS file header
  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Crew Roster Exporter//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ].join('\r\n') + '\r\n';
  
  // Add each event
  events.forEach(event => {
    // Escape special characters in description
    const description = event.description.replace(/\\|;|,/g, (match) => {
      return '\\' + match;
    }).replace(/\n/g, '\\n');
    
    icsContent += [
      'BEGIN:VEVENT',
      `DTSTART:${event.start}`,
      `DTEND:${event.end}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT'
    ].join('\r\n') + '\r\n';
  });
  
  // ICS file footer
  icsContent += 'END:VCALENDAR';
  
  return icsContent;
}

// Function to export duty data to calendar
function exportToCalendar() {
  console.log('[CREW ROSTER EXPORTER] Exporting to calendar');
  
  try {
    // Extract duty data
    extractDutyData().then(dutyData => {
      if (!dutyData || dutyData.length === 0) {
        alert('No duty data found to export. Please try again on a roster page.');
        return;
      }
      
      // Generate events
      const events = generateGoogleCalendarEvents(dutyData);
      
      if (events.length === 0) {
        alert('Could not generate calendar events from the roster data.');
        return;
      }
      
      // Create modal for export options
      const modal = document.createElement('div');
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 100001;
        font-family: Arial, sans-serif;
      `;
      
      // Modal content
      const modalContent = document.createElement('div');
      modalContent.style.cssText = `
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      `;
      
      // Modal header
      const header = document.createElement('h2');
      header.textContent = 'Export to Calendar';
      header.style.cssText = `
        margin-top: 0;
        color: #1976d2;
        font-size: 20px;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
      `;
      
      // Close button
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.cssText = `
        position: absolute;
        top: 15px;
        right: 15px;
        background: transparent;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #666;
      `;
      closeButton.onclick = () => document.body.removeChild(modal);
      
      // Options section
      const optionsSection = document.createElement('div');
      optionsSection.style.cssText = `
        margin: 15px 0;
      `;
      
      // Add export options
      const exportAllBtn = document.createElement('button');
      exportAllBtn.textContent = 'Export All to Google Calendar';
      exportAllBtn.style.cssText = `
        background-color: #1976d2;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 10px 15px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        margin-right: 10px;
      `;
      exportAllBtn.onclick = () => {
        // Generate ICS file with all events
        const icsContent = generateICSFile(events);
        
        // Create a downloadable link
        const link = document.createElement('a');
        link.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsContent);
        link.download = 'crew_roster.ics';
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('Calendar file generated. Import this file into Google Calendar, Apple Calendar, Outlook, or any other calendar app.');
      };
      
      // Events list
      const eventsList = document.createElement('div');
      eventsList.style.cssText = `
        margin-top: 20px;
        max-height: 400px;
        overflow-y: auto;
        border: 1px solid #eee;
        border-radius: 4px;
      `;
      
      // Add each event to the list
      events.forEach((event, index) => {
        const eventItem = document.createElement('div');
        eventItem.style.cssText = `
          padding: 10px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
          ${index % 2 === 0 ? 'background-color: #f9f9f9;' : ''}
        `;
        
        // Event details
        const details = document.createElement('div');
        details.innerHTML = `
          <div class="export-event-title">${event.title}</div>
          <div style="font-size: 12px; color: #666;">
            ${event.rawDate} | ${event.rawSignOn} - ${event.rawSignOff}
          </div>
        `;
        
        // Add to Google Calendar link
        const addToGCalBtn = document.createElement('a');
        addToGCalBtn.href = createGoogleCalendarUrl(event);
        addToGCalBtn.target = '_blank';
        addToGCalBtn.textContent = 'Add to GCal';
        addToGCalBtn.style.cssText = `
          background-color: #4285F4;
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          text-decoration: none;
          font-size: 12px;
        `;
        
        eventItem.appendChild(details);
        eventItem.appendChild(addToGCalBtn);
        eventsList.appendChild(eventItem);
      });
      
      // Create bottom action section with a prominent close button
      const actionSection = document.createElement('div');
      actionSection.style.cssText = `
        margin-top: 20px;
        display: flex;
        justify-content: flex-end;
        border-top: 1px solid #eee;
        padding-top: 15px;
      `;
      
      // Create a more prominent close button at the bottom
      const closeButtonBottom = document.createElement('button');
      closeButtonBottom.textContent = 'Close';
      closeButtonBottom.style.cssText = `
        background-color: #f5f5f5;
        color: #333;
        border: none;
        border-radius: 4px;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      `;
      closeButtonBottom.onmouseover = () => {
        closeButtonBottom.style.backgroundColor = '#e0e0e0';
      };
      closeButtonBottom.onmouseout = () => {
        closeButtonBottom.style.backgroundColor = '#f5f5f5';
      };
      closeButtonBottom.onclick = () => document.body.removeChild(modal);
      
      actionSection.appendChild(closeButtonBottom);
      
      // Assemble modal
      modalContent.appendChild(header);
      modalContent.appendChild(closeButton);
      modalContent.appendChild(optionsSection);
      optionsSection.appendChild(exportAllBtn);
      modalContent.appendChild(eventsList);
      modalContent.appendChild(actionSection);
      modal.appendChild(modalContent);
      
      // Add to body
      document.body.appendChild(modal);
      
    }).catch(error => {
      console.error('[CREW ROSTER EXPORTER] Error exporting to calendar:', error);
      alert('Error exporting to calendar. Please check the console for details.');
    });
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error exporting to calendar:', error);
    alert('Error exporting to calendar. Please check the console for details.');
  }
}

// Function to format crew details for display
function formatCrewDetails(crewDetails) {
  if (!crewDetails || crewDetails.length === 0) return 'No crew info';
  
  return crewDetails.map(crew => {
    const position = crew.position || '';
    const name = crew.name || '';
    const id = crew.id || '';
    
    if (name && id) {
      return `${position}: ${name} (${id})`;
    } else if (name) {
      return `${position}: ${name}`;
    } else {
      return position;
    }
  }).join(' | ');
}

// Function to generate the print preview
function generatePrintPreview(options) {
  console.log('[CREW ROSTER EXPORTER] Generating print preview with options:', options);
  
  // Create a new window for the print preview
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups for this site to use the print feature.');
    return;
  }
  
  // Get the title of the roster period
  const rosterPeriod = extractRosterPeriod();
  
  // Enhanced print preview navbar styles
  const printPreviewNavbarStyles = `
    /* Print preview navbar styles */
    .print-preview-navbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: rgba(25, 118, 210, 0.9);
      backdrop-filter: blur(5px);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 10000;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
      font-family: Arial, sans-serif;
    }
    
    .navbar-title {
      color: white;
      font-size: 16px;
      font-weight: bold;
    }
    
    .navbar-buttons {
      display: flex;
      gap: 12px;
    }
    
    .navbar-button {
      background-color: white;
      color: #1976d2;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .navbar-button:hover {
      background-color: #f5f5f5;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
    
    .navbar-button:active {
      transform: translateY(0);
    }
    
    .print-button {
      background-color: #2196f3;
      color: white;
    }
    
    .print-button:hover {
      background-color: #1976d2;
    }
    
    /* Hide navbar when printing */
    @media print {
      .print-preview-navbar {
        display: none !important;
      }
      
      /* Remove any margins/padding added for the navbar */
      body {
        padding-bottom: 0 !important;
        margin-bottom: 0 !important;
      }
    }
  `;
  
  // Open a new window and write content
  printWindow.document.write(`
    <html>
    <head>
      <title>Crew Roster Print</title>
      <link rel="icon" href="${chrome.runtime.getURL('icon-16.png')}" type="image/png">
      <link rel="stylesheet" href="${chrome.runtime.getURL('content/styles.css')}">
      <style>
        ${stylesByView[options.view] || ''}
        ${extraStyles}
        ${printPreviewNavbarStyles}
      </style>
    </head>
    <body>
      <div class="container">
  `);

  // Add calendar view content
  if (options.printCalendar) {
    const calendarHTML = extractCalendarHTML();
    printWindow.document.write(`
      <div class="calendar-view-container">
        <h1>Calendar View</h1>
        <div class="period-title">${rosterPeriod}</div>
        ${calendarHTML}
      </div>
    `);
  }
  
  // Add day view content
  if (options.printDay) {
    const dayViewHTML = generateDayViewHTML(dutyData);
    printWindow.document.write(`
      <div class="day-view-container">
        <h1>Day View</h1>
        <div class="period-title">${rosterPeriod}</div>
        ${dayViewHTML}
      </div>
    `);
  }
  
  printWindow.document.write(`
      </div>
      
      <!-- Enhanced print preview navbar -->
      <div class="print-preview-navbar">
        <span class="navbar-title">Crew Roster Exporter</span>
        <div class="navbar-buttons">
          <button class="navbar-button print-button" onclick="window.print()">Print ${options.printCalendar ? 'Calendar View' : 'Day View'}</button>
          <button class="navbar-button" onclick="window.close()">Close Window</button>
        </div>
      </div>
      
      <script>
        // Add padding to the bottom of the body to prevent content from being hidden under the navbar
        document.body.style.paddingBottom = '60px';
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
}

// Function to extract date range
function extractDateRange() {
  console.log('[CREW ROSTER EXPORTER] Extracting date range from the page');
  try {
    // Try to find the date range element
    const dateRangeElement = document.querySelector('.roster-period, .ant-select-selection-item, [class*="roster-period"], [class*="date-range"]');
    
    if (dateRangeElement) {
      const dateRange = dateRangeElement.textContent.trim();
      console.log('[CREW ROSTER EXPORTER] Found date range:', dateRange);
      return dateRange;
    }
    
    // If we couldn't find a specific date range element, try to find month/year indicators
    const monthElement = document.querySelector('[class*="month-indicator"], [class*="year-indicator"], .month, .year');
    if (monthElement) {
      const monthYear = monthElement.textContent.trim();
      console.log('[CREW ROSTER EXPORTER] Found month/year:', monthYear);
      return monthYear;
    }
    
    // If all else fails, extract from the first day element
    const firstDayElement = document.querySelector('[class*="day-number"], [class*="date-number"]');
    const lastDayElement = document.querySelectorAll('[class*="day-number"], [class*="date-number"]');
    
    if (firstDayElement && lastDayElement.length > 0) {
      const firstDay = firstDayElement.textContent.trim();
      const lastDay = lastDayElement[lastDayElement.length - 1].textContent.trim();
      
      // Try to find month elements
      const monthElements = document.querySelectorAll('[class*="month-name"], [class*="month-label"]');
      let monthText = '';
      
      if (monthElements.length > 0) {
        monthText = monthElements[0].textContent.trim();
      }
      
      const dateRange = `${firstDay} - ${lastDay} ${monthText}`;
      console.log('[CREW ROSTER EXPORTER] Constructed date range:', dateRange);
      return dateRange;
    }
    
    // Default fallback
    const today = new Date();
    const month = today.toLocaleString('default', { month: 'long' });
    const year = today.getFullYear();
    return `${month} ${year}`;
    
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error extracting date range:', error);
    return 'Roster Period';
  }
}

// Function to create and inject a fixed navbar with print buttons
function createPrintNavbar() {
  console.log('[CREW ROSTER EXPORTER] Creating fixed navbar with print buttons');
  
  try {
    // Force remove any existing navbar to avoid duplication issues
    const existingNavbar = document.getElementById('crew-roster-navbar');
    if (existingNavbar) {
      existingNavbar.remove();
    }
    
    // Create the navbar container with more prominent styling - now at the bottom
    const navbar = document.createElement('div');
    navbar.id = 'crew-roster-navbar';
    navbar.className = 'crew-roster-navbar';
    navbar.style.cssText = 'position: fixed; bottom: 0; left: 0; right: 0; background-color: rgba(25, 118, 210, 0.9); backdrop-filter: blur(5px); padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; z-index: 100000; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.2); font-family: Arial, sans-serif; color: white;';
    
    // Create title/info text
    const titleSpan = document.createElement('span');
    titleSpan.className = 'crew-roster-title';
    titleSpan.textContent = 'Crew Roster Exporter';
    titleSpan.style.cssText = 'color: white; font-size: 16px; font-weight: bold;';
    
    // Create the buttons container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'crew-roster-buttons';
    buttonsContainer.style.cssText = 'display: flex; gap: 10px;';
    
    // Create print buttons for different views with inline styles - now with better styling to match print preview
    const views = [
      { value: 'calendar', text: 'Export Calendar', action: 'print' },
      { value: 'day', text: 'Export Day View', action: 'print' },
      { value: 'gcal', text: 'Export to Google Calendar', action: 'calendar' },
      { value: 'flyingcards', text: 'Print Flying Cards', action: 'flyingcards' }
    ];
    
    views.forEach(view => {
      const button = document.createElement('button');
      button.className = 'crew-roster-navbar-button';
      button.textContent = view.text;
      
      // Style buttons differently based on action
      if (view.action === 'calendar') {
        button.style.cssText = 'background-color: #4285F4; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);';
      } else if (view.action === 'flyingcards') {
        button.style.cssText = 'background-color: #ff9800; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);';
      } else {
        button.style.cssText = 'background-color: white; color: #1976d2; border: none; border-radius: 4px; padding: 8px 16px; font-size: 14px; font-weight: bold; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);';
      }
      
      button.onclick = (e) => {
        e.preventDefault();
        if (view.action === 'calendar') {
          console.log(`[CREW ROSTER EXPORTER] Exporting to Google Calendar`);
          exportToCalendar();
        } else if (view.action === 'flyingcards') {
          console.log(`[CREW ROSTER EXPORTER] Printing flying cards`);
          if (window.crewRosterExporter?.flyingCards?.showSelectionModal) {
            window.crewRosterExporter.flyingCards.showSelectionModal();
          } else {
            console.error('[CREW ROSTER EXPORTER] Flying cards module not loaded');
            alert('Flying cards feature is not available. Please refresh the page and try again.');
          }
        } else {
          console.log(`[CREW ROSTER EXPORTER] Printing roster with view: ${view.value}`);
          printRoster(view.value);
        }
      };
      
      // Add hover effect
      button.onmouseover = () => {
        if (view.action === 'calendar') {
          button.style.backgroundColor = '#3367d6';
        } else if (view.action === 'flyingcards') {
          button.style.backgroundColor = '#ff8a3d';
        } else {
          button.style.backgroundColor = '#f5f5f5';
        }
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
      };
      button.onmouseout = () => {
        if (view.action === 'calendar') {
          button.style.backgroundColor = '#4285F4';
        } else if (view.action === 'flyingcards') {
          button.style.backgroundColor = '#ff9800';
        } else {
          button.style.backgroundColor = 'white';
        }
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      };
      
      buttonsContainer.appendChild(button);
    });
    
    // Append elements to the navbar
    navbar.appendChild(titleSpan);
    navbar.appendChild(buttonsContainer);
    
    // Add navbar to the body - doesn't need to be at the beginning anymore
    if (document.body) {
      document.body.appendChild(navbar);
      console.log('[CREW ROSTER EXPORTER] Fixed navbar successfully created and injected at the bottom of body');
    } else {
      console.error('[CREW ROSTER EXPORTER] Body element not available, cannot inject navbar');
    }
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error creating navbar:', error);
  }
}

// Function to specifically target the main roster page only
function injectNavbarIntoMainPage() {
  console.log('[CREW ROSTER EXPORTER] Checking if current page is main roster page');
  
  // Check if we're in the main roster page and not in the print window
  const isPrintWindow = window.location.href.includes('about:blank') || 
                       document.title === 'Crew Roster Print' || 
                       document.querySelector('.print-container');
                       
  if (isPrintWindow) {
    console.log('[CREW ROSTER EXPORTER] This is a print window, not injecting navbar');
    return false;
  }
  
  // Check for roster page elements
  const isRosterPage = document.querySelector('.roster-calendar') || 
                      document.querySelector('[class*="roster-left"]') || 
                      document.querySelector('[data-v-49188c51]');
                      
  if (!isRosterPage) {
    console.log('[CREW ROSTER EXPORTER] Not a roster page, not injecting navbar');
    return false;
  }
  
  console.log('[CREW ROSTER EXPORTER] This is a main roster page, injecting navbar');
  createPrintNavbar();
  return true;
}

// Simplified direct immediate initialization
(function immediateInit() {
  // Wait a short moment for the page to initialize
  setTimeout(function() {
    console.log('[CREW ROSTER EXPORTER] Immediate initialization starting');
    try {
      injectNavbarIntoMainPage();
    } catch (error) {
      console.error('[CREW ROSTER EXPORTER] Error in immediate initialization:', error);
    }
  }, 500);
})();

// Set up additional initialization triggers for robustness
document.addEventListener('DOMContentLoaded', function() {
  console.log('[CREW ROSTER EXPORTER] DOMContentLoaded event fired');
  setTimeout(injectNavbarIntoMainPage, 1000);
});

window.addEventListener('load', function() {
  console.log('[CREW ROSTER EXPORTER] Window load event fired');
  setTimeout(injectNavbarIntoMainPage, 1000);
});

// MutationObserver approach to detect when the roster elements are added to the DOM
setTimeout(function() {
  console.log('[CREW ROSTER EXPORTER] Setting up MutationObserver');
  
  try {
    const observer = new MutationObserver(function(mutations) {
      const hasRosterElements = document.querySelector('.roster-calendar') || 
                              document.querySelector('[class*="roster-left"]') || 
                              document.querySelector('[data-v-49188c51]');
      
      if (hasRosterElements) {
        console.log('[CREW ROSTER EXPORTER] Roster elements detected by MutationObserver');
        injectNavbarIntoMainPage();
        observer.disconnect();
      }
    });
    
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    // Safety disconnect after 30 seconds
    setTimeout(function() {
      observer.disconnect();
    }, 30000);
  } catch (error) {
    console.error('[CREW ROSTER EXPORTER] Error setting up MutationObserver:', error);
  }
}, 2000);

// Enhanced function to check window visibility and reinject if needed
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('[CREW ROSTER EXPORTER] Page became visible, checking if navbar exists');
    const navbar = document.getElementById('crew-roster-navbar');
    if (!navbar) {
      console.log('[CREW ROSTER EXPORTER] Navbar missing, reinjecting');
      injectNavbarIntoMainPage();
    }
  }
});

// Initialize the extension - simplified version
function initializeExtension() {
  injectNavbarIntoMainPage();
  expandAllFlightLogs();
}

// Helper function to format crew details for display
function formatCrewDetails(crewDetails) {
  if (!crewDetails || crewDetails.length === 0) return 'No crew info';
  
  return crewDetails.map(crew => {
    const position = crew.position || '';
    const name = crew.name || '';
    const id = crew.id || '';
    
    if (name && id) {
      return `${position}: ${name} (${id})`;
    } else if (name) {
      return `${position}: ${name}`;
    } else {
      return position;
    }
  }).join(' | ');
}

// Listen for messages from the popup
window.addEventListener('message', (event) => {
  // Only accept messages from the same frame
  if (event.source !== window) return;

  console.log('[CREW ROSTER EXPORTER] Message received:', event.data);
  
  if (!event.data.type) return;
  
  // Handle different message types
  switch(event.data.type) {
    case 'PRINT_ROSTER':
      handlePrintRoster(event.data.payload);
      break;
    case 'EXPORT_CALENDAR':
      exportToCalendar(dutyData);
      break;
    case 'SHOW_FLYING_CARDS':
      // Show flying cards selection modal
      if (window.crewRosterExporter?.flyingCards?.showSelectionModal) {
        window.crewRosterExporter.flyingCards.showSelectionModal();
      } else {
        console.error('[CREW ROSTER EXPORTER] Flying cards module not loaded');
        alert('Flying cards feature is not available. Please refresh the page and try again.');
      }
      break;
    default:
      console.warn('[CREW ROSTER EXPORTER] Unknown message type:', event.data.type);
  }
});

// Function to handle print roster requests
function handlePrintRoster(payload) {
  console.log('[CREW ROSTER EXPORTER] Print roster request received:', payload);
  
  // Check if we have duty data
  if (!dutyData || dutyData.length === 0) {
    console.error('[CREW ROSTER EXPORTER] No duty data available for printing');
    alert('No duty data available for printing. Please ensure the roster is loaded correctly.');
    return;
  }
  
  // Get the view option
  const view = payload?.view || 'calendar';
  
  // Generate print preview based on view
  generatePrintPreview({
    printCalendar: view === 'calendar',
    printDay: view === 'day',
    printBoth: view === 'both',
    view: view
  });
}

// For backward compatibility, also listen to window messages
window.addEventListener("message", function(event) {
  if (event.data && event.data.type === "PRINT_ROSTER") {
    const payload = event.data.payload || { view: "calendar" };
    chrome.runtime.sendMessage({
      action: "PRINT_ROSTER",
      view: payload.view
    });
  }
});

// Create and add the bottom navbar
createPrintNavbar();

// Initialize the flying cards module if available
if (window.crewRosterExporter?.flyingCards?.init) {
  window.crewRosterExporter.flyingCards.init(dutyData);
} else {
  // If not yet available, wait for it to load
  flyingCardsScript.onload = () => {
    if (window.crewRosterExporter?.flyingCards?.init) {
      window.crewRosterExporter.flyingCards.init(dutyData);
    }
  };
}

// Main processing function - extracts duty data and creates HTML
function processDutyData() {
  console.log('[CREW ROSTER EXPORTER] Processing duty data');
  
  // Extract duty data
  dutyData = extractDutyData();
  
  if (!dutyData || dutyData.length === 0) {
    console.error('[CREW ROSTER EXPORTER] No duty data found, cannot proceed');
    return;
  }
  
  console.log('[CREW ROSTER EXPORTER] Duty data extracted:', dutyData);
  
  // Create and add the bottom navbar
  createPrintNavbar();
  
  // Initialize the flying cards module if available
  if (window.crewRosterExporter?.flyingCards?.init) {
    console.log('[CREW ROSTER EXPORTER] Initializing flying cards module with duty data');
    window.crewRosterExporter.flyingCards.init(dutyData);
  } else {
    // If not yet available, wait for it to load
    console.log('[CREW ROSTER EXPORTER] Flying cards module not yet available, setting up onload handler');
    flyingCardsScript.onload = () => {
      console.log('[CREW ROSTER EXPORTER] Flying cards module loaded, initializing');
      if (window.crewRosterExporter?.flyingCards?.init) {
        window.crewRosterExporter.flyingCards.init(dutyData);
      } else {
        console.error('[CREW ROSTER EXPORTER] Flying cards module loaded but init function not found');
      }
    };
  }
}

// Wait for DOM content to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[CREW ROSTER EXPORTER] Content script loaded');
  
  // Try to extract duty data
  processDutyData();
});

// Main entry point - try to extract duty data again when the page state changes
document.addEventListener('rosupdate', () => {
  console.log('[CREW ROSTER EXPORTER] Roster update detected');
  setTimeout(processDutyData, 1000);
});
