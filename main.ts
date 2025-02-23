import { App, Modal, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface SnakePluginSettings {
	highScore: number;
	snakeColor: string;
	foodColor: string;
	gameSpeed: number;
	followTheme: boolean;
}

const DEFAULT_SETTINGS: SnakePluginSettings = {
	highScore: 0,
	snakeColor: '#4CAF50',  // Default green color
	foodColor: '#FF5722',   // Default orange color
	gameSpeed: 150,
	followTheme: true
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
			.setName('Follow Theme Colors')
			.setDesc('Use Obsidian theme colors for the game elements')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followTheme)
				.onChange(async (value) => {
					this.plugin.settings.followTheme = value;
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

		containerEl.createEl('h2', { text: 'Instructions' });
		const instructions = containerEl.createEl('div', { cls: 'setting-item-description' });
		instructions.innerHTML = `
			<p>🎮 Use arrow keys, WASD, or HJKL to control the snake</p>
			<p>🍎 Collect food to grow and increase score</p>
			<p>⚡ Speed increases as you collect food</p>
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

			switch(e.key) {
				case 'ArrowUp':
				case 'w':
				case 'k':
					if (this.direction !== 'down') this.nextDirection = 'up';
					break;
				case 'ArrowDown':
				case 's':
				case 'j':
					if (this.direction !== 'up') this.nextDirection = 'down';
					break;
				case 'ArrowLeft':
				case 'a':
				case 'h':
					if (this.direction !== 'right') this.nextDirection = 'left';
					break;
				case 'ArrowRight':
				case 'd':
				case 'l':
					if (this.direction !== 'left') this.nextDirection = 'right';
					break;
			}
			e.preventDefault();
		};
	}

	private togglePause() {
		this.isPaused = !this.isPaused;
		if (this.isPaused) {
			clearInterval(this.gameLoop);
			this.pauseButton.setText('Resume (ESC)');
			this.showPauseMenu();
		} else {
			this.container.querySelector('.snake-menu')?.remove();
			this.gameLoop = window.setInterval(() => this.updateGameState(), this.moveInterval);
			this.pauseButton.setText('Pause (ESC)');
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
		this.snake = [{ x: 10, y: 10 }];
		this.direction = 'right';
		this.nextDirection = 'right';
		this.score = 0;
		this.gridSize = 20;
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
		const size = Math.min(maxWidth, maxHeight, 600);
		
		this.canvas.width = size;
		this.canvas.height = size;
		this.gridSize = Math.floor(size / 20);
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
		this.gameLoop = window.setInterval(() => this.updateGameState(), this.moveInterval);
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

	private updateGameState() {
		if (this.gameOver || this.isPaused) {
			return;
		}

		// Update direction
		this.direction = this.nextDirection;

		// Move snake
		const head = { ...this.snake[0] };
		switch (this.direction) {
			case 'up': head.y--; break;
			case 'down': head.y++; break;
			case 'left': head.x--; break;
			case 'right': head.x++; break;
		}

		// Check collision with walls
		if (head.x < 0 || head.x >= this.canvas.width / this.gridSize ||
			head.y < 0 || head.y >= this.canvas.height / this.gridSize) {
			this.gameOver = true;
			this.showGameOverMenu();
			return;
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
			
			// Increase speed slightly
			if (this.moveInterval > 50) {
				this.moveInterval -= 2;
				clearInterval(this.gameLoop);
				this.gameLoop = window.setInterval(() => this.updateGameState(), this.moveInterval);
			}
		} else {
			this.snake.pop();
		}
	}

	private animate = (currentTime: number = 0) => {
		if (!this.gameStarted || this.gameOver) return;

		// Update game state immediately on animation frame for more responsive controls
		if (!this.isPaused) {
			this.direction = this.nextDirection;
		}

		const deltaTime = currentTime - this.lastFrameTime;
		const progress = Math.min(deltaTime / this.moveInterval, 1);

		// Clear canvas
		this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--background-primary');
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

		// Draw grid (subtle)
		this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--background-modifier-border');
		this.ctx.lineWidth = 0.5;
		this.ctx.globalAlpha = 0.2;
		for (let i = 0; i <= this.canvas.width; i += this.gridSize) {
			this.ctx.beginPath();
			this.ctx.moveTo(i, 0);
			this.ctx.lineTo(i, this.canvas.height);
			this.ctx.stroke();
		}
		for (let i = 0; i <= this.canvas.height; i += this.gridSize) {
			this.ctx.beginPath();
			this.ctx.moveTo(0, i);
			this.ctx.lineTo(this.canvas.width, i);
			this.ctx.stroke();
		}
		this.ctx.globalAlpha = 1;

		// Draw snake with interpolation
		const snakeColor = this.plugin.settings.followTheme 
			? getComputedStyle(document.body).getPropertyValue('--interactive-accent')
			: this.plugin.settings.snakeColor;
		this.ctx.fillStyle = snakeColor;
		this.snake.forEach((segment, index) => {
			let x = segment.x * this.gridSize;
			let y = segment.y * this.gridSize;

			if (index === 0 && segment.actualX !== undefined && segment.actualY !== undefined) {
				x = segment.actualX + (segment.x * this.gridSize - segment.actualX) * progress;
				y = segment.actualY + (segment.y * this.gridSize - segment.actualY) * progress;
			}

			// Draw snake segment with rounded corners
			this.ctx.beginPath();
			this.ctx.roundRect(
				x + 1,
				y + 1,
				this.gridSize - 2,
				this.gridSize - 2,
				4
			);
			this.ctx.fill();
		});

		// Draw food with pulsing animation
		const foodColor = this.plugin.settings.followTheme
			? getComputedStyle(document.body).getPropertyValue('--text-accent')
			: this.plugin.settings.foodColor;
		this.ctx.fillStyle = foodColor;
		const foodSize = this.gridSize - 2 + Math.sin(currentTime / 200) * 2;

		// Draw food as a circle
		this.ctx.beginPath();
		this.ctx.arc(
			this.food.x * this.gridSize + this.gridSize/2,
			this.food.y * this.gridSize + this.gridSize/2,
			foodSize/2,
			0,
			Math.PI * 2
		);
		this.ctx.fill();

		if (!this.gameOver && !this.isPaused) {
			this.lastFrameTime = currentTime;
			this.animationFrame = requestAnimationFrame(this.animate);
		}
	}

	private generateFood(): { x: number, y: number } {
		let x: number, y: number;
		do {
			x = Math.floor(Math.random() * (this.canvas.width / this.gridSize));
			y = Math.floor(Math.random() * (this.canvas.height / this.gridSize));
		} while (this.snake.some(segment => segment.x === x && segment.y === y));
		return { x, y };
	}
}
