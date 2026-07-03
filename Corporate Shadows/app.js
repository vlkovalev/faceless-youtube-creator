// Embed data to prevent local file:// CORS errors, while keeping dashboard fully dynamic
const CHANNEL_CONFIG = {
  "channel": {
    "name": "Shadow Empires",
    "niche": "Dark Business History & Corporate Scams",
    "tagline": "Unmasking the greed, secrets, and scandals that built the world's most powerful empires.",
    "description": "From blood diamonds to toxic monopolies, we pull back the curtain on history's most ruthless business empires. New documentaries weekly.",
    "branding": {
      "colors": {
        "background": "#0a0b0e",
        "panel": "#161920",
        "primary": "#7c3aed",
        "secondary": "#f59e0b",
        "text": "#f3f4f6",
        "text_secondary": "#9ca3af",
        "border": "#2d3139"
      }
    }
  },
  "viral_ideas": [
    {
      "id": 1,
      "title": "How One Family Fooled the World into Buying Worthless Rocks",
      "target_ctr": "12.4%",
      "difficulty": "Easy (High Visual Assets)",
      "duration": "8m 15s",
      "status": "ready",
      "topic": "The De Beers diamond cartel, artificial scarcity, and marketing scams.",
      "hook": "A diamond is forever. A marketing slogan so powerful it tricked the entire human race into buying common stones. This is the dark history of the De Beers empire.",
      "thumbnail_concept": "A hand holding a glowing blue diamond in a dark mine, bold red text: 'THEY FOOLED YOU'.",
      "ctr_angle": "Extreme curiosity and validation check."
    },
    {
      "id": 2,
      "title": "The Poisoned Formula: The Corporate Giant That Stole Africa's Markets",
      "target_ctr": "9.8%",
      "difficulty": "Medium",
      "duration": "8m 30s",
      "status": "ready",
      "topic": "Nestlé's aggressive baby formula campaign in developing nations.",
      "hook": "In the 1970s, one food conglomerate launched a sales campaign so aggressive it led to thousands of infant deaths. This is how they captured a continent.",
      "thumbnail_concept": "A classic baby bottle filled with dark sludge against a bright corporate skyscraper, bold red text: 'TOXIC GREED'.",
      "ctr_angle": "Outrage and historical shock."
    },
    {
      "id": 3,
      "title": "The Secret Society That Controlled the World's Electricity",
      "target_ctr": "11.2%",
      "difficulty": "Easy",
      "duration": "8m 05s",
      "status": "ready",
      "topic": "The Phoebus Cartel, planned obsolescence, and lightbulb conspiracies.",
      "hook": "In 1924, a group of businessmen gathered in a smoke-filled room in Geneva. Their goal? Make lightbulbs burn out faster. And they got away with it.",
      "thumbnail_concept": "A vintage glowing lightbulb with a dollar sign filament, bold red text: 'THE CARTEL'.",
      "ctr_angle": "Conspiracy unmasking and everyday relevance."
    },
    {
      "id": 4,
      "title": "The Billion-Dollar Poison: How America's Sweetest Brand Fooled a Generation",
      "target_ctr": "10.5%",
      "difficulty": "Medium",
      "duration": "8m 45s",
      "status": "ready",
      "topic": "The sugar lobby's bribery of scientists in the 1960s to blame fat for heart disease.",
      "hook": "For fifty years, you were told that fat makes you fat. It was a lie. A lie bought and paid for by three Harvard scientists and a bag of cash.",
      "thumbnail_concept": "Sugar cubes stacked like a skull, bold text: 'THE LIE'.",
      "ctr_angle": "Health revelation and betrayal."
    },
    {
      "id": 5,
      "title": "The Company That Literally Conquered India (and Went Bankrupt)",
      "target_ctr": "8.7%",
      "difficulty": "Hard",
      "duration": "9m 10s",
      "status": "ready",
      "topic": "The rise and fall of the East India Company.",
      "hook": "It had its own army of 260,000 men. It ruled over 150 million people. It was the first corporation too big to fail.",
      "thumbnail_concept": "An old British ship sailing into a stormy sea of coins, bold text: 'THE EMPEROR'.",
      "ctr_angle": "Geopolitical scale and irony."
    },
    {
      "id": 6,
      "title": "The Toxic Empire: The Family That Hooked America on Pain",
      "target_ctr": "13.1%",
      "difficulty": "Medium",
      "duration": "8m 20s",
      "status": "ready",
      "topic": "The Sackler family, Purdue Pharma, and the OxyContin epidemic.",
      "hook": "They wore expensive suits, donated to world-class museums, and built a dynasty. Behind it all was a chemical that destroyed millions of families.",
      "thumbnail_concept": "A golden pill bottle leaking glowing liquid, bold text: 'PUNISHED?'.",
      "ctr_angle": "High indignation and modern relevance."
    },
    {
      "id": 7,
      "title": "The Silent Killer: How a Chemical Giant Poisoned a Town",
      "target_ctr": "11.2%",
      "difficulty": "Medium",
      "duration": "9m 19s",
      "status": "ready",
      "topic": "DuPont's contamination of drinking water with C8 (Teflon chemical) in Parkersburg, West Virginia.",
      "hook": "For decades, a corporate giant dumped a toxic chemical into a town's drinking water, knowing exactly what it did to the human body. This is the dark history of DuPont and Teflon.",
      "thumbnail_concept": "A dark chemical glass with toxic green bubbles next to a frying pan, bold text: 'TEFLON POISON'.",
      "ctr_angle": "Everyday consumer risk and corporate scandal."
    },
    {
      "id": 8,
      "title": "The Company That Patented Nature: How a Corporate Giant Controlled the World's Seeds",
      "target_ctr": "11.5%",
      "difficulty": "Medium",
      "duration": "10m 45s",
      "status": "ready",
      "topic": "Monsanto's patenting of genetically modified crops and their aggressive enforcement against independent family farmers.",
      "hook": "They don't own the grocery stores. They don't own the farms. But if a farmer grows a crop using seed carried by the wind from a neighboring field, they will sue them into bankruptcy. Welcome to the war on nature.",
      "thumbnail_concept": "A single green sprout growing through a rusted metal lock, bold text: 'PATENTED'.",
      "ctr_angle": "Outrage and consumer awareness."
    },
    {
      "id": 9,
      "title": "The Tech Empire That Sold Out the Free World",
      "target_ctr": "11.6%",
      "difficulty": "Medium",
      "duration": "8m 15s",
      "status": "confirmed",
      "topic": "Yahoo's complicity in Chinese dissident tracking.",
      "hook": "Before Google was a giant, Yahoo ruled the web. But in a desperate attempt to conquer the Chinese market, they handed over a single email address. It cost a man ten years of his life.",
      "thumbnail_concept": "A dark internet screen with red target brackets, bold text: 'BETRAYED'.",
      "ctr_angle": "Tech surveillance and betrayal."
    },
    {
      "id": 10,
      "title": "The Golden Scam: The Man Who Sold a Fake Gold Mine",
      "target_ctr": "12.8%",
      "difficulty": "Medium",
      "duration": "8m 40s",
      "status": "ready",
      "topic": "The Bre-X mining scandal in the Indonesian jungle.",
      "hook": "A geologist, a businessman, and a jungle in Borneo. They claimed they found the largest gold deposit in human history. It was all a complete illusion, made with gold dust from a wedding ring.",
      "thumbnail_concept": "A massive open pit mine with a golden vortex, bold text: 'FAKE GOLD'.",
      "ctr_angle": "Spectacular heist and greed."
    },
    {
      "id": 11,
      "title": "The Bananapocalypse: The Fruit Company That Overthrew Governments",
      "target_ctr": "9.4%",
      "difficulty": "Hard (Historical Details)",
      "duration": "8m 50s",
      "status": "confirmed",
      "topic": "United Fruit Company, CIA operations, and banana republics.",
      "hook": "A single fruit company controlled the railways, the mail, and the politicians of Central America. And when one president stood in their way, they called in the CIA.",
      "thumbnail_concept": "A banana peeled to reveal a military tank, bold text: 'FRUIT CO.'.",
      "ctr_angle": "Bizarre historical facts and dark irony."
    },
    {
      "id": 12,
      "title": "The Secret Monopoly That Controls Everything You Wear",
      "target_ctr": "10.1%",
      "difficulty": "Easy",
      "duration": "8m 10s",
      "status": "confirmed",
      "topic": "Luxottica's dominance of the eyewear industry.",
      "hook": "Why do plastic glasses cost $400? Because whether you buy Oakley, Ray-Ban, or Prada, you are buying from the exact same company. Welcome to the illusion of choice.",
      "thumbnail_concept": "A pair of sunglasses reflecting a single giant eyeball, bold text: 'NO CHOICE'.",
      "ctr_angle": "Consumer awareness and eye-opening facts."
    }
  ]
};

let currentScriptId = 1;
let currentModel = 'omni_video'; // Default to the premium Omni Video 3.0

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  renderDashboard(currentScriptId);
  renderStrategy();
  setupInteractions();
});

function getScriptData(scriptId) {
  return window.SCRIPTS && window.SCRIPTS[scriptId];
}

function updateAssetPreview(scriptId) {
  const scriptData = getScriptData(scriptId);
  if (!scriptData) return;

  const thumbnailImg = document.getElementById('youtube-thumbnail-img');
  if (thumbnailImg) {
    thumbnailImg.src = scriptId === 1 ? 'assets/youtube_thumbnail.png' : `assets/youtube_thumbnail_video_${scriptId}.png`;
    thumbnailImg.alt = `YouTube Thumbnail: ${scriptData.video.title}`;
  }

  const selectedIdea = CHANNEL_CONFIG.viral_ideas.find(idea => idea.id === scriptId);
  const previewHeaderBadge = document.querySelector('.asset-preview-header .badge');
  if (previewHeaderBadge && selectedIdea) {
    previewHeaderBadge.textContent = `Est. CTR: ${selectedIdea.target_ctr}`;
  }

  const metaRows = document.querySelectorAll('.asset-meta-row .val');
  if (metaRows[0]) metaRows[0].textContent = scriptData.video.title;
  if (metaRows[1]) metaRows[1].textContent = selectedIdea ? selectedIdea.topic : scriptData.video.niche;
  if (metaRows[2]) metaRows[2].textContent = selectedIdea ? selectedIdea.thumbnail_concept : 'Generated thumbnail concept';
}

// Sidebar & views switcher
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const views = document.querySelectorAll('.tab-view');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      const targetView = link.getAttribute('data-view');
      
      navLinks.forEach(l => l.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      
      link.classList.add('active');
      const targetEl = document.getElementById(`${targetView}-view`);
      if (targetEl) targetEl.classList.add('active');
    });
  });
}

// Render Production Workspace Tab
function renderDashboard(scriptId) {
  const scriptContainer = document.getElementById('script-container');
  const storyboardContainer = document.getElementById('storyboard-container');
  
  if (!scriptContainer || !storyboardContainer) return;
  
  scriptContainer.innerHTML = '';
  storyboardContainer.innerHTML = '';
  
  const scriptData = window.SCRIPTS && window.SCRIPTS[scriptId];
  if (!scriptData) {
    scriptContainer.innerHTML = '<div style="padding: 2rem; color: #9ca3af;">Script data not found or still generating...</div>';
    return;
  }
  
  const durationBadge = document.getElementById('video-duration');
  if (durationBadge) durationBadge.textContent = 'Duration: ' + scriptData.video.duration;
  
  const scriptHeader = document.querySelector('.script-panel .panel-header h2');
  if (scriptHeader) scriptHeader.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg> ${scriptData.video.title}`;

  scriptData.scenes.forEach((scene, index) => {
    // 1. Render Script Blocks
    const scriptBlock = document.createElement('div');
    scriptBlock.className = `script-block ${index === 0 ? 'active' : ''}`;
    scriptBlock.setAttribute('data-scene', scene.scene_number);
    scriptBlock.innerHTML = `
      <div class="scene-tag">Scene ${scene.scene_number}: ${scene.title}</div>
      <div class="narration-text">${scene.voiceover}</div>
      <div class="script-meta">
        <span>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
          Cinematic adam (11 Labs)
        </span>
        <span>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          ${scene.pacing_note}
        </span>
      </div>
    `;
    scriptContainer.appendChild(scriptBlock);
    
    // 2. Render Storyboard Card
    const storyboardCard = document.createElement('div');
    storyboardCard.className = `storyboard-card ${index === 0 ? 'active' : ''}`;
    storyboardCard.id = `storyboard-card-${scene.scene_number}`;
    storyboardCard.setAttribute('data-scene', scene.scene_number);
    
    // Build shots array — use visual_shots if available, fall back to single visual_prompt
    const shots = scene.visual_shots && scene.visual_shots.length
      ? scene.visual_shots
      : [{ label: 'Hero Shot', prompt: scene.visual_prompt }];
    const shotCount = shots.length;
    const cardId = `storyboard-card-${scene.scene_number}`;

    // Define model-specific labels, badges, and layout HTML dynamically
    let modelBadgeText = '';
    let animateBtnText = 'Animate Shot';
    let cardDirectivesHTML = '';

    if (currentModel === 'seed_dance') {
      modelBadgeText = `Seed Dance 2.0 · ${shotCount} Shot${shotCount > 1 ? 's' : ''}`;
      animateBtnText = 'Animate Shot';
      cardDirectivesHTML = `
        <div class="card-directives">
          <div class="directive">
            <div class="directive-label">Camera Movement</div>
            <div class="directive-val">${scene.camera_movement}</div>
          </div>
          <div class="directive">
            <div class="directive-label">Sound FX Cues</div>
            <div class="directive-val">${scene.sound_effect}</div>
          </div>
        </div>
      `;
    } else if (currentModel === 'omni_video') {
      modelBadgeText = `Omni Video 3.0 (Cinema) · ${shotCount} Shot${shotCount > 1 ? 's' : ''}`;
      animateBtnText = 'Render Omni Video';
      cardDirectivesHTML = `
        <div class="card-directives premium-directives">
          <div class="directive select-directive">
            <div class="directive-label">Camera Movement</div>
            <select class="premium-directive-select" data-scene="${scene.scene_number}" data-field="camera_movement">
              <option value="default" selected>${scene.camera_movement}</option>
              <option value="dolly_zoom">Dolly Zoom (Cinematic)</option>
              <option value="pan_right">Slow Pan Right</option>
              <option value="zoom_in">Slow Zoom In (Tension)</option>
              <option value="crane_down">Crane Down Establishing</option>
            </select>
          </div>
          <div class="directive select-directive">
            <div class="directive-label">Voice Binding</div>
            <select class="premium-directive-select" data-scene="${scene.scene_number}" data-field="voice_binding">
              <option value="adam" selected>Adam (Cinematic Accent)</option>
              <option value="rachel">Rachel (Narrator Profile)</option>
              <option value="antigravity">Antigravity Premium Voice</option>
              <option value="orthodox_chant">Orthodox Chant (Deep Ambient)</option>
            </select>
          </div>
        </div>
        <div class="premium-audio-synthesis-controls" style="margin-top: 0.75rem; background: rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.03); padding: 0.65rem 0.85rem; border-radius: 8px;">
          <div style="font-size: 0.65rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem;">Omni Native Audio Synthesis</div>
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: rgba(255,255,255,0.8); cursor: pointer;">
              <input type="checkbox" checked style="accent-color: var(--primary-color);"> Ambient Dialogue
            </label>
            <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: rgba(255,255,255,0.8); cursor: pointer;">
              <input type="checkbox" checked style="accent-color: var(--primary-color);"> Native SFX
            </label>
            <label style="display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; color: rgba(255,255,255,0.8); cursor: pointer;">
              <input type="checkbox" style="accent-color: var(--primary-color);"> Sub-bass Pad
            </label>
          </div>
        </div>
      `;
    } else if (currentModel === 'omni_flash') {
      modelBadgeText = `Omni Flash ⚡ · ${shotCount} Shot${shotCount > 1 ? 's' : ''}`;
      animateBtnText = 'Flash Preview';
      cardDirectivesHTML = `
        <div class="card-directives premium-directives">
          <div class="directive">
            <div class="directive-label">Flash Latency</div>
            <div class="directive-val" style="color: var(--success-color); font-weight: 700;">1.2 seconds (Realtime)</div>
          </div>
          <div class="directive select-directive">
            <div class="directive-label">Sampling Steps</div>
            <select class="premium-directive-select" data-scene="${scene.scene_number}" data-field="steps">
              <option value="8">8 Steps (Ultra Fast)</option>
              <option value="12" selected>12 Steps (Balanced)</option>
              <option value="20">20 Steps (Quality Focus)</option>
            </select>
          </div>
        </div>
      `;
    }

    // Build shot slides HTML
    const slidesHTML = shots.map((shot, si) => `
      <div class="shot-slide${si === 0 ? ' active' : ''}" data-shot="${si}">
        ${(scene.scene_number === 2 && scriptId === 1 && si === 0)
          ? `<img src="assets/scene_2.png" alt="Scene 2" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
          : ''}
        <div class="card-placeholder-text"${(scene.scene_number === 2 && scriptId === 1 && si === 0) ? ' style="display:none;"' : ''}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          <span class="shot-label-badge">${shot.label}</span>
          <button class="action-btn animate-cue-btn" style="padding: 0.35rem 0.65rem; font-size:0.7rem; margin-top:0.4rem;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px; height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
            ${animateBtnText}
          </button>
        </div>
      </div>
    `).join('');

    // Dot indicators
    const dotsHTML = shotCount > 1
      ? `<div class="shot-dots">${shots.map((_, si) => `<span class="shot-dot${si === 0 ? ' active' : ''}" data-dot="${si}"></span>`).join('')}</div>`
      : '';

    // Navigation arrows (only if >1 shot)
    const arrowsHTML = shotCount > 1 ? `
      <button class="shot-nav shot-prev" aria-label="Previous shot">&#8249;</button>
      <button class="shot-nav shot-next" aria-label="Next shot">&#8250;</button>
    ` : '';

    // Active shot prompt (shown below, updates on nav)
    const promptsDataAttr = shots.map(s => s.prompt).join('|||');

    storyboardCard.innerHTML = `
      <div class="card-preview-container">
        <div class="shot-carousel" data-current="0" data-prompts="${promptsDataAttr.replace(/"/g, '&quot;')}">
          ${slidesHTML}
          ${arrowsHTML}
          ${dotsHTML}
        </div>
        <div class="card-prompt-badge">${modelBadgeText}</div>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title">${scene.title}</div>
          <div class="card-number">Scene #${scene.scene_number}</div>
        </div>
        <div class="shot-tabs">${shots.map((s, si) => `<button class="shot-tab${si === 0 ? ' active' : ''}" data-tab="${si}">${s.label}</button>`).join('')}</div>
        <div class="prompt-text active-prompt">
          <strong>Visual Prompt:</strong> "${shots[0].prompt}"
        </div>
        ${cardDirectivesHTML}
      </div>
    `;
    storyboardContainer.appendChild(storyboardCard);
  });

  bindDashboardInteractions();
  updateAssetPreview(scriptId);
}

// Render Content Strategy Tab (10 Viral Ideas)
function renderStrategy() {
  const ideasGrid = document.getElementById('ideas-grid');
  if (!ideasGrid) return;
  
  ideasGrid.innerHTML = '';
  
  CHANNEL_CONFIG.viral_ideas.forEach(idea => {
    const card = document.createElement('div');
    card.className = `idea-card ${idea.status}`;
    
    // Status text mapping
    let statusText = 'Confirmed';
    if (idea.status === 'ready') statusText = 'Production Ready';
    if (idea.status === 'drafting') statusText = 'Drafting';
    
    const hasScript = Boolean(getScriptData(idea.id));
    const buttonLabel = hasScript ? 'View Script' : 'Queued';
    const disabledAttr = hasScript ? '' : 'disabled style="opacity:0.4; cursor:not-allowed;"';

    card.innerHTML = `
      <div class="idea-header">
        <div class="idea-id-badge">#${idea.id}</div>
        <span class="idea-status ${idea.status}">${statusText}</span>
      </div>
      <h3 class="idea-title">${idea.title}</h3>
      <p class="idea-topic">${idea.topic}</p>
      <div class="idea-hook">"${idea.hook}"</div>
      <div class="idea-footer">
        <div class="idea-metric ctr">
          <span class="label">Est. CTR</span>
          <span class="val">${idea.target_ctr}</span>
        </div>
        <div class="idea-metric">
          <span class="label">Difficulty</span>
          <span class="val">${idea.difficulty}</span>
        </div>
        <button class="action-btn select-script-btn" data-id="${idea.id}" ${disabledAttr}>
          ${buttonLabel}
        </button>
      </div>
    `;
    ideasGrid.appendChild(card);
  });
}

// Interactivity linking script column & storyboard column
function bindDashboardInteractions() {
  const scriptBlocks = document.querySelectorAll('.script-block');
  const storyboardCards = document.querySelectorAll('.storyboard-card');
  const storyboardBody = document.querySelector('.storyboard-panel .panel-body');
  
  if (!scriptBlocks.length || !storyboardCards.length || !storyboardBody) return;
  
  // Link 1: Clicking script block highlights and scrolls storyboard card
  scriptBlocks.forEach(block => {
    block.addEventListener('click', () => {
      const sceneNum = block.getAttribute('data-scene');
      
      scriptBlocks.forEach(b => b.classList.remove('active'));
      block.classList.add('active');
      
      storyboardCards.forEach(c => c.classList.remove('active'));
      const targetCard = document.getElementById(`storyboard-card-${sceneNum}`);
      
      if (targetCard) {
        targetCard.classList.add('active');
        
        // Scroll targetCard smoothly inside .storyboard-panel .panel-body
        storyboardBody.scrollTo({
          top: targetCard.offsetTop - storyboardBody.offsetTop - 16,
          behavior: 'smooth'
        });
      }
    });
  });

  // Link 2: Clicking storyboard card highlights script block
  storyboardCards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicked on the inner animate button
      if (e.target.closest('.animate-cue-btn')) return;
      
      const sceneNum = card.getAttribute('data-scene');
      
      storyboardCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      scriptBlocks.forEach(b => b.classList.remove('active'));
      const targetBlock = document.querySelector(`.script-block[data-scene="${sceneNum}"]`);
      if (targetBlock) {
        targetBlock.classList.add('active');
        
        const scriptBody = document.querySelector('.script-panel .panel-body');
        scriptBody.scrollTo({
          top: targetBlock.offsetTop - scriptBody.offsetTop - 16,
          behavior: 'smooth'
        });
      }
    });
  });

  // ── Shot carousel navigation ──────────────────────────────────────────────
  document.querySelectorAll('.shot-carousel').forEach(carousel => {
    const card = carousel.closest('.storyboard-card');
    const slides = carousel.querySelectorAll('.shot-slide');
    const dots = carousel.querySelectorAll('.shot-dot');
    const tabs = card ? card.querySelectorAll('.shot-tab') : [];
    const promptEl = card ? card.querySelector('.active-prompt') : null;
    const promptsRaw = carousel.getAttribute('data-prompts') || '';
    const prompts = promptsRaw.split('|||');
    let current = 0;

    function goTo(n) {
      current = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('active', i === current));
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
      tabs.forEach((t, i) => t.classList.toggle('active', i === current));
      if (promptEl && prompts[current]) {
        promptEl.innerHTML = `<strong>Visual Prompt:</strong> "${prompts[current]}"`;
      }
      carousel.setAttribute('data-current', current);
    }

    carousel.querySelector('.shot-prev')?.addEventListener('click', e => { e.stopPropagation(); goTo(current - 1); });
    carousel.querySelector('.shot-next')?.addEventListener('click', e => { e.stopPropagation(); goTo(current + 1); });
    dots.forEach(dot => dot.addEventListener('click', e => { e.stopPropagation(); goTo(parseInt(dot.getAttribute('data-dot'))); }));
    tabs.forEach(tab => tab.addEventListener('click', e => { e.stopPropagation(); goTo(parseInt(tab.getAttribute('data-tab'))); }));
  });

  // Handle animate button clicks
  document.querySelectorAll('.animate-cue-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.storyboard-card');
      const sceneNum = card.getAttribute('data-scene');
      
      const parentTextEl = btn.parentElement;
      const originalHTML = parentTextEl.innerHTML;
      
      let animateMsg = 'Animate via Higsfield Seed Dance 2.0...';
      let successMsg = 'Cinematic clip rendered (5.0s)';
      let animationDuration = 3000;
      
      if (currentModel === 'omni_video') {
        animateMsg = 'Synthesizing cinematic Omni Video 3.0 with native audio...';
        successMsg = 'Cinematic Omni clip with native audio rendered (8.5s)';
        animationDuration = 4500;
      } else if (currentModel === 'omni_flash') {
        animateMsg = 'Generating real-time Omni Flash frame...';
        successMsg = 'Omni Flash frame generated in 1.2s';
        animationDuration = 1200;
      }
      
      parentTextEl.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:24px; height:24px; animation: spin 1s linear infinite; stroke:var(--primary-color);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L21 4"></path></svg>
        <span style="font-size:0.75rem; color:var(--primary-color); margin-top:0.4rem; text-align: center; max-width: 80%;">${animateMsg}</span>
      `;
      
      setTimeout(() => {
        parentTextEl.innerHTML = `
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:24px; height:24px; stroke:var(--success-color);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span style="font-size:0.75rem; color:var(--success-color); margin-top:0.4rem; text-align: center; max-width: 80%;">${successMsg}</span>
          <button class="action-btn animate-cue-btn" style="padding: 0.25rem 0.5rem; font-size:0.65rem; margin-top:0.4rem;" onclick="location.reload();">
            Play Loop
          </button>
        `;
      }, animationDuration);
    });
  });
}

function setupInteractions() {
  // Download simulation interaction
  const downloadBtn = document.querySelector('.download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const originalText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" class="animate-spin" style="width: 18px; height: 18px; animation: spin 1s linear infinite;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L21 4"></path></svg>
        Compiling Asset Package...
      `;
      
      setTimeout(() => {
        downloadBtn.innerHTML = `
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Packaged Downloaded Successfully!
        `;
        downloadBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        
        const link = document.createElement('a');
        link.href = document.getElementById('youtube-thumbnail-img')?.src || 'assets/youtube_thumbnail.png';
        link.download = `shadow_empires_video_${currentScriptId}_thumbnail.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => {
          downloadBtn.innerHTML = originalText;
          downloadBtn.style.background = '';
        }, 3000);
      }, 1500);
    });
  }

  // Handle Strategy view script click
  document.querySelectorAll('.select-script-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const scriptId = parseInt(btn.getAttribute('data-id'));
      currentScriptId = scriptId;
      renderDashboard(scriptId);
      
      const activeLink = document.querySelector('.nav-link[data-view="dashboard"]');
      if (activeLink) activeLink.click();
    });
  });
}

// Add spin animation CSS inline dynamically
const style = document.createElement('style');
style.innerHTML = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
