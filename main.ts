import { App, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface SnakePluginSettings {
	highScore: number;
	snakeColor: string;
	foodColor: string;
	gameSpeed: number;
	followTheme: boolean;
	gridSize: number;
	speedIncrease: number;
	enableAnimations: boolean;
}

const DEFAULT_SETTINGS: SnakePluginSettings = {
	highScore: 0,
	snakeColor: '#4CAF50',
	foodColor: '#FF5722',
	gameSpeed: 150,
	followTheme: true,
	gridSize: 20,
	speedIncrease: 2,
	enableAnimations: false
}

export default class SnakePlugin extends Plugin {
	settings: SnakePluginSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon for the game
		this.addRibbonIcon('game-die', 'Play Snake', () => {
			new SnakeGameModal(this.app, this).open();
		});

		// Add command to open the game
		this.addCommand({
			id: 'open-snake-game',
			name: 'Open Snake Game',
			callback: () => {
				new SnakeGameModal(this.app, this).open();
			},
			hotkeys: []
		});

		// Add settings tab
		this.addSettingTab(new SnakeSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SnakeSettingTab extends PluginSettingTab {
	plugin: SnakePlugin;

	constructor(app: App, plugin: SnakePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Enable Animations (experimental)')
			.setDesc('Toggle smooth animations (disable for classic grid-based movement)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAnimations)
				.onChange(async (value) => {
					this.plugin.settings.enableAnimations = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Follow Theme Colors')
			.setDesc('Use Obsidian theme colors for the game elements')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followTheme)
				.onChange(async (value) => {
					this.plugin.settings.followTheme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Grid Size')
			.setDesc('Number of cells in the grid (smaller = more cells, harder game)')
			.addSlider(slider => slider
				.setLimits(10, 40, 1)
				.setValue(this.plugin.settings.gridSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.gridSize = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Initial Game Speed')
			.setDesc('Starting speed of the game (lower = faster)')
			.addSlider(slider => slider
				.setLimits(50, 300, 10)
				.setValue(this.plugin.settings.gameSpeed)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.gameSpeed = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Speed Increase')
			.setDesc('How much faster the game gets when eating food (0 = constant speed)')
			.addSlider(slider => slider
				.setLimits(0, 10, 1)
				.setValue(this.plugin.settings.speedIncrease)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.speedIncrease = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Snake Color')
			.setDesc('Custom color for the snake (used when not following theme)')
			.addText(text => text
				.setPlaceholder('#4CAF50')
				.setValue(this.plugin.settings.snakeColor)
				.onChange(async (value) => {
					this.plugin.settings.snakeColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Food Color')
			.setDesc('Custom color for the food (used when not following theme)')
			.addText(text => text
				.setPlaceholder('#FF5722')
				.setValue(this.plugin.settings.foodColor)
				.onChange(async (value) => {
					this.plugin.settings.foodColor = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h2', { text: 'Instructions' });
		const instructions = containerEl.createEl('div', { cls: 'setting-item-description' });
		instructions.innerHTML = `
			<p>🎮 Use arrow keys, WASD, or HJKL to control the snake</p>
			<p>🍎 Collect food to grow and increase score</p>
			<p>⚡ Speed increases as you collect food (if enabled)</p>
			<p>⏸️ Press ESC to pause the game</p>
			<p>�� You can set custom hotkeys in Obsidian's Hotkey settings</p>
		`;
	}
}

class SnakeGameModal extends Modal {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private snake: { x: number, y: number, actualX?: number, actualY?: number }[];
	private food: { x: number, y: number };
	private direction: string;
	private nextDirection: string;
	private gameLoop: number;
	private animationFrame: number;
	private score: number;
	private gridSize: number;
	private gameOver: boolean;
	private gameStarted: boolean;
	private plugin: SnakePlugin;
	private keyDownHandler: (e: KeyboardEvent) => void;
	private lastFrameTime: number;
	private moveInterval: number;
	private container: HTMLDivElement;
	private scoreDisplay: HTMLDivElement;
	private pauseButton: HTMLButtonElement;
	private isPaused: boolean;
	private lastMoveTime: number = 0;
	private inputQueue: string[] = [];
	private readonly MAX_QUEUED_INPUTS = 2;

	constructor(app: App, plugin: SnakePlugin) {
		super(app);
		this.plugin = plugin;
		this.moveInterval = this.plugin.settings.gameSpeed;
		this.isPaused = false;
		this.initializeGame();
		
		this.keyDownHandler = (e: KeyboardEvent) => {
			if (!this.gameStarted) {
				if (e.key === 'Enter' || e.key === ' ') {
					this.startGame();
				}
				return;
			}

			if (e.key === 'Escape') {
				this.togglePause();
				e.preventDefault();
				return;
			}

			if (this.isPaused) return;

			let newDirection: string | null = null;
			switch(e.key) {
				case 'ArrowUp':
				case 'w':
				case 'k':
					newDirection = 'up';
					break;
				case 'ArrowDown':
				case 's':
				case 'j':
					newDirection = 'down';
					break;
				case 'ArrowLeft':
				case 'a':
				case 'h':
					newDirection = 'left';
					break;
				case 'ArrowRight':
				case 'd':
				case 'l':
					newDirection = 'right';
					break;
			}

			if (newDirection && this.isValidDirection(newDirection) && 
				this.inputQueue.length < this.MAX_QUEUED_INPUTS) {
				this.inputQueue.push(newDirection);
			}
			e.preventDefault();
		};
	}

	private isValidDirection(newDir: string): boolean {
		const lastDir = this.inputQueue.length > 0 ? 
			this.inputQueue[this.inputQueue.length - 1] : this.direction;
		
		return !(
			(lastDir === 'up' && newDir === 'down') ||
			(lastDir === 'down' && newDir === 'up') ||
			(lastDir === 'left' && newDir === 'right') ||
			(lastDir === 'right' && newDir === 'left')
		);
	}

	private togglePause() {
		this.isPaused = !this.isPaused;
		if (this.isPaused) {
			this.pauseButton.setText('Resume (ESC)');
			this.showPauseMenu();
		} else {
			this.container.querySelector('.snake-menu')?.remove();
			this.lastMoveTime = performance.now();
			this.pauseButton.setText('Pause (ESC)');
			this.animate();
		}
	}

	private showPauseMenu() {
		const menuDiv = this.container.createDiv('snake-menu');
		const title = menuDiv.createEl('h2');
		title.setText('Game Paused');
		
		const scoreDiv = menuDiv.createDiv('snake-high-score');
		scoreDiv.setText(`Current Score: ${this.score}`);
		
		const resumeBtn = menuDiv.createEl('button');
		resumeBtn.setText('Resume Game');
		resumeBtn.onclick = () => this.togglePause();
		
		const restartBtn = menuDiv.createEl('button');
		restartBtn.setText('Restart Game');
		restartBtn.style.marginTop = '10px';
		restartBtn.onclick = () => {
			this.isPaused = false;
			menuDiv.remove();
			this.initializeGame();
			this.showStartMenu();
		};
	}

	private initializeGame() {
		const centerX = Math.floor(this.plugin.settings.gridSize / 2);
		const centerY = Math.floor(this.plugin.settings.gridSize / 2);
		
		this.snake = [{ x: centerX, y: centerY }];
		this.direction = 'right';
		this.nextDirection = 'right';
		this.score = 0;
		this.gameOver = false;
		this.gameStarted = false;
		this.lastFrameTime = 0;
		this.moveInterval = this.plugin.settings.gameSpeed;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		this.container = contentEl.createDiv('snake-game-container');
		
		const headerDiv = this.container.createDiv({ cls: 'snake-header' });
		
		// Create score display
		this.scoreDisplay = headerDiv.createDiv('snake-score');
		this.scoreDisplay.setText(`Score: ${this.score} | High Score: ${this.plugin.settings.highScore}`);

		// Create pause button
		this.pauseButton = headerDiv.createEl('button', { cls: 'snake-control-button' });
		this.pauseButton.setText('Pause (ESC)');
		this.pauseButton.onclick = () => this.togglePause();
		this.pauseButton.style.display = 'none';

		// Create canvas
		this.canvas = this.container.createEl('canvas', { cls: 'snake-canvas' });
		this.canvas.width = 400;
		this.canvas.height = 400;
		
		this.ctx = this.canvas.getContext('2d')!;
		
		// Generate initial food
		this.food = this.generateFood();
		
		// Add keyboard controls
		document.addEventListener('keydown', this.keyDownHandler);

		// Show start menu
		this.showStartMenu();

		// Make canvas responsive
		this.adjustCanvasSize();
		window.addEventListener('resize', () => this.adjustCanvasSize());
	}

	private adjustCanvasSize() {
		const maxWidth = this.container.clientWidth - 40;
		const maxHeight = window.innerHeight - 200;
		const size = Math.min(maxWidth, maxHeight, 800); // Increased max size
		
		this.canvas.width = size;
		this.canvas.height = size;
		this.gridSize = Math.floor(size / this.plugin.settings.gridSize);

		// Recalculate positions when canvas size changes
		if (this.snake && this.food) {
			this.snake = this.snake.map(segment => ({
				x: segment.x,
				y: segment.y,
				actualX: segment.x * this.gridSize,
				actualY: segment.y * this.gridSize
			}));
			
			// Ensure food is still in bounds
			if (this.food.x >= this.plugin.settings.gridSize || this.food.y >= this.plugin.settings.gridSize) {
				this.food = this.generateFood();
			}
		}
	}

	private showStartMenu() {
		const menuDiv = this.container.createDiv('snake-menu');
		const title = menuDiv.createEl('h2');
		title.setText('🐍 Snake Game');
		
		const instructionsDiv = menuDiv.createDiv('snake-instructions');
		instructionsDiv.innerHTML = `
			<p>Use arrow keys or WASD to move</p>
			<p>Press ESC to pause</p>
			<p>Collect food to grow and score points</p>
		`;
		
		const startBtn = menuDiv.createEl('button');
		startBtn.setText('Start Game');
		startBtn.onclick = () => this.startGame();
		
		if (this.plugin.settings.highScore > 0) {
			const highScore = menuDiv.createDiv('snake-high-score');
			highScore.setText(`High Score: ${this.plugin.settings.highScore}`);
		}
	}

	private showGameOverMenu() {
		const menuDiv = this.container.createDiv('snake-menu');
		const title = menuDiv.createEl('h2');
		title.setText('🏁 Game Over!');
		
		const scoreDiv = menuDiv.createDiv('snake-high-score');
		scoreDiv.setText(`Final Score: ${this.score}`);
		
		if (this.score > this.plugin.settings.highScore) {
			const newHighScore = menuDiv.createDiv('snake-high-score');
			newHighScore.setText('🏆 New High Score!');
			this.plugin.settings.highScore = this.score;
			this.plugin.saveSettings();
		}
		
		const restartBtn = menuDiv.createEl('button');
		restartBtn.setText('Play Again');
		restartBtn.onclick = () => {
			menuDiv.remove();
			this.initializeGame();
			this.showStartMenu();
		};
	}

	private startGame() {
		this.container.querySelector('.snake-menu')?.remove();
		this.gameStarted = true;
		this.lastFrameTime = performance.now();
		this.lastMoveTime = this.lastFrameTime;
		this.animate();
		this.pauseButton.style.display = 'block';
	}

	onClose() {
		if (this.gameLoop) clearInterval(this.gameLoop);
		if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
		document.removeEventListener('keydown', this.keyDownHandler);
		window.removeEventListener('resize', () => this.adjustCanvasSize());
		const { contentEl } = this;
		contentEl.empty();
	}

	private updateGameState(currentTime: number) {
		if (this.gameOver || this.isPaused) return;

		// Process queued inputs
		if (this.inputQueue.length > 0) {
			this.direction = this.inputQueue.shift()!;
		}

		// Move snake
		const head = { ...this.snake[0] };
		switch (this.direction) {
			case 'up': head.y = (head.y - 1 + this.plugin.settings.gridSize) % this.plugin.settings.gridSize; break;
			case 'down': head.y = (head.y + 1) % this.plugin.settings.gridSize; break;
			case 'left': head.x = (head.x - 1 + this.plugin.settings.gridSize) % this.plugin.settings.gridSize; break;
			case 'right': head.x = (head.x + 1) % this.plugin.settings.gridSize; break;
		}

		// Check collision with self
		if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
			this.gameOver = true;
			this.showGameOverMenu();
			return;
		}

		// Add new head with actual coordinates for animation
		const newHead = {
			x: head.x,
			y: head.y,
			actualX: this.snake[0].x * this.gridSize,
			actualY: this.snake[0].y * this.gridSize
		};
		this.snake.unshift(newHead);

		// Check if food is eaten
		if (head.x === this.food.x && head.y === this.food.y) {
			this.score += 10;
			this.scoreDisplay.setText(`Score: ${this.score} | High Score: ${this.plugin.settings.highScore}`);
			this.food = this.generateFood();
			
			// Increase speed if enabled
			if (this.plugin.settings.speedIncrease > 0 && this.moveInterval > 50) {
				this.moveInterval -= this.plugin.settings.speedIncrease;
			}
		} else {
			this.snake.pop();
		}

		this.lastMoveTime = currentTime;
	}

	private animate = (currentTime: number = 0) => {
		if (!this.gameStarted || this.gameOver) return;

		// Calculate time since last frame and movement
		const timeSinceLastMove = currentTime - this.lastMoveTime;

		// Update game state if enough time has passed
		if (timeSinceLastMove >= this.moveInterval) {
			this.updateGameState(currentTime);
		}

		// Calculate animation progress only if animations are enabled
		const progress = this.plugin.settings.enableAnimations ? 
			Math.min(timeSinceLastMove / this.moveInterval, 1) : 1;

		// Clear canvas
		this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--background-primary');
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		// Draw grid (subtle)
		this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--background-modifier-border');
		this.ctx.lineWidth = 0.5;
		this.ctx.globalAlpha = 0.2;
		
		// Draw grid lines
		for (let i = 0; i <= this.plugin.settings.gridSize; i++) {
			const x = i * this.gridSize;
			const y = i * this.gridSize;
			
			this.ctx.beginPath();
			this.ctx.moveTo(x, 0);
			this.ctx.lineTo(x, this.canvas.height);
			this.ctx.stroke();
			
			this.ctx.beginPath();
			this.ctx.moveTo(0, y);
			this.ctx.lineTo(this.canvas.width, y);
			this.ctx.stroke();
		}
		
		this.ctx.globalAlpha = 1;

		// Draw snake
		const snakeColor = this.plugin.settings.followTheme 
			? getComputedStyle(document.body).getPropertyValue('--interactive-accent')
			: this.plugin.settings.snakeColor;
		this.ctx.fillStyle = snakeColor;

		if (this.plugin.settings.enableAnimations) {
			// Draw snake body with interpolation
			for (let i = this.snake.length - 1; i > 0; i--) {
				const segment = this.snake[i];
				let x = segment.x * this.gridSize;
				let y = segment.y * this.gridSize;

				if (segment.actualX !== undefined && segment.actualY !== undefined) {
					x = segment.actualX + (segment.x * this.gridSize - segment.actualX) * progress;
					y = segment.actualY + (segment.y * this.gridSize - segment.actualY) * progress;
				}

				this.drawSnakeSegment(x, y);
			}

			// Draw head without interpolation
			const head = this.snake[0];
			this.drawSnakeSegment(head.x * this.gridSize, head.y * this.gridSize);
		} else {
			// Draw snake without animations
			this.snake.forEach(segment => {
				this.drawSnakeSegment(segment.x * this.gridSize, segment.y * this.gridSize);
			});
		}

		// Draw food
		const foodColor = this.plugin.settings.followTheme
			? getComputedStyle(document.body).getPropertyValue('--text-accent')
			: this.plugin.settings.foodColor;
		this.ctx.fillStyle = foodColor;

		if (this.plugin.settings.enableAnimations) {
			// Draw food with pulsing animation
			const foodSize = this.gridSize - 2 + Math.sin(currentTime / 200) * Math.min(4, this.gridSize / 5);
			this.drawFood(foodSize);
		} else {
			// Draw food without animation
			this.drawFood(this.gridSize - 2);
		}

		if (!this.gameOver && !this.isPaused) {
			this.animationFrame = requestAnimationFrame(this.animate);
		}
	}

	private drawSnakeSegment(x: number, y: number) {
		this.ctx.beginPath();
		this.ctx.roundRect(
			x + 1,
			y + 1,
			this.gridSize - 2,
			this.gridSize - 2,
			Math.min(4, this.gridSize / 4)
		);
		this.ctx.fill();
	}

	private drawFood(size: number) {
		this.ctx.beginPath();
		this.ctx.arc(
			this.food.x * this.gridSize + this.gridSize/2,
			this.food.y * this.gridSize + this.gridSize/2,
			size/2,
			0,
			Math.PI * 2
		);
		this.ctx.fill();
	}

	private generateFood(): { x: number, y: number } {
		let x: number, y: number;
		do {
			x = Math.floor(Math.random() * this.plugin.settings.gridSize);
			y = Math.floor(Math.random() * this.plugin.settings.gridSize);
		} while (this.snake.some(segment => segment.x === x && segment.y === y));
		return { x, y };
	}
}
