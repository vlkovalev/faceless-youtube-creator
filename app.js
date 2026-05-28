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
      "status": "confirmed",
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
      "status": "confirmed",
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
      "status": "drafting",
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
      "status": "confirmed",
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
      "status": "confirmed",
      "topic": "The Sackler family, Purdue Pharma, and the OxyContin epidemic.",
      "hook": "They wore expensive suits, donated to world-class museums, and built a dynasty. Behind it all was a chemical that destroyed millions of families.",
      "thumbnail_concept": "A golden pill bottle leaking glowing liquid, bold text: 'PUNISHED?'.",
      "ctr_angle": "High indignation and modern relevance."
    },
    {
      "id": 7,
      "title": "The Secret Monopoly That Controls Everything You Wear",
      "target_ctr": "10.1%",
      "difficulty": "Easy",
      "duration": "8m 10s",
      "status": "confirmed",
      "topic": "Luxottica's dominance of the eyewear industry.",
      "hook": "Why do plastic glasses cost $400? Because whether you buy Oakley, Ray-Ban, or Prada, you are buying from the exact same company. Welcome to the illusion of choice.",
      "thumbnail_concept": "A pair of sunglasses reflecting a single giant eyeball, bold text: 'NO CHOICE'.",
      "ctr_angle": "Consumer awareness and eye-opening facts."
    },
    {
      "id": 8,
      "title": "The Bananapocalypse: The Fruit Company That Overthrew Governments",
      "target_ctr": "9.4%",
      "difficulty": "Hard",
      "duration": "8m 50s",
      "status": "confirmed",
      "topic": "United Fruit Company, CIA operations, and banana republics.",
      "hook": "A single fruit company controlled the railways, the mail, and the politicians of Central America. And when one president stood in their way, they called in the CIA.",
      "thumbnail_concept": "A banana peeled to reveal a military tank, bold text: 'FRUIT CO.'.",
      "ctr_angle": "Bizarre historical facts and dark irony."
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
      "status": "confirmed",
      "topic": "The Bre-X mining scandal in the Indonesian jungle.",
      "hook": "A geologist, a businessman, and a jungle in Borneo. They claimed they found the largest gold deposit in human history. It was all a complete illusion, made with gold dust from a wedding ring.",
      "thumbnail_concept": "A massive open pit mine with a golden vortex, bold text: 'FAKE GOLD'.",
      "ctr_angle": "Spectacular heist and greed."
    }
  ]
};

let currentScriptId = 1;

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
    
    // Preview content logic
    let previewHTML = '';
    if (scene.scene_number === 2 && scriptId === 1) {
      previewHTML = `<img src="assets/scene_2.png" alt="Scene 2: Vintage Office" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`;
    }
    
    storyboardCard.innerHTML = `
      <div class="card-preview-container">
        ${previewHTML}
        <div class="card-placeholder-text" style="${(scene.scene_number === 2 && scriptId === 1) ? 'display:none;' : ''}">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          <span>Higsfield Seed Dance 2.0 Video Preview</span>
          <button class="action-btn animate-cue-btn" style="padding: 0.35rem 0.65rem; font-size:0.7rem; margin-top:0.4rem;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px; height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
            Animate Scene
          </button>
        </div>
        <div class="card-prompt-badge">Soul Cinema 2.0</div>
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div class="card-title">${scene.title}</div>
          <div class="card-number">Scene #${scene.scene_number}</div>
        </div>
        <div class="prompt-text">
          <strong>Visual Prompt:</strong> "${scene.visual_prompt}"
        </div>
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

  // Handle animate button clicks
  document.querySelectorAll('.animate-cue-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.storyboard-card');
      const sceneNum = card.getAttribute('data-scene');
      
      const parentTextEl = btn.parentElement;
      const originalHTML = parentTextEl.innerHTML;
      
      parentTextEl.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:24px; height:24px; animation: spin 1s linear infinite; stroke:var(--primary-color);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L21 4"></path></svg>
        <span style="font-size:0.75rem; color:var(--primary-color); margin-top:0.4rem;">Animate via Higsfield Seed Dance 2.0...</span>
      `;
      
      setTimeout(() => {
        parentTextEl.innerHTML = `
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:24px; height:24px; stroke:var(--success-color);"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span style="font-size:0.75rem; color:var(--success-color); margin-top:0.4rem;">Cinematic clip rendered (5.0s)</span>
          <button class="action-btn animate-cue-btn" style="padding: 0.25rem 0.5rem; font-size:0.65rem; margin-top:0.4rem;" onclick="location.reload();">
            Play Loop
          </button>
        `;
      }, 3000);
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
