import { App, Modal, Plugin, PluginSettingTab } from 'obsidian';

interface SnakePluginSettings {
	highScore: number;
}

const DEFAULT_SETTINGS: SnakePluginSettings = {
	highScore: 0
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
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SnakeGameModal extends Modal {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private snake: { x: number, y: number }[];
	private food: { x: number, y: number };
	private direction: string;
	private gameLoop: number;
	private score: number;
	private gridSize: number;
	private gameOver: boolean;
	private plugin: SnakePlugin;
	private keyDownHandler: (e: KeyboardEvent) => void;

	constructor(app: App, plugin: SnakePlugin) {
		super(app);
		this.plugin = plugin;
		this.snake = [{ x: 10, y: 10 }];
		this.direction = 'right';
		this.score = 0;
		this.gridSize = 20;
		this.gameOver = false;
		
		this.keyDownHandler = (e: KeyboardEvent) => {
			switch(e.key) {
				case 'ArrowUp':
					if (this.direction !== 'down') this.direction = 'up';
					break;
				case 'ArrowDown':
					if (this.direction !== 'up') this.direction = 'down';
					break;
				case 'ArrowLeft':
					if (this.direction !== 'right') this.direction = 'left';
					break;
				case 'ArrowRight':
					if (this.direction !== 'left') this.direction = 'right';
					break;
			}
			e.preventDefault();
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		
		// Create score display
		const scoreDiv = contentEl.createDiv();
		scoreDiv.style.textAlign = 'center';
		scoreDiv.style.marginBottom = '10px';
		scoreDiv.setText(`Score: ${this.score}`);

		// Create canvas
		this.canvas = contentEl.createEl('canvas');
		this.canvas.width = 400;
		this.canvas.height = 400;
		this.canvas.style.border = '2px solid #000';
		
		this.ctx = this.canvas.getContext('2d')!;
		
		// Generate initial food
		this.food = this.generateFood();
		
		// Start game loop
		this.gameLoop = window.setInterval(() => this.update(scoreDiv), 150);
		
		// Add keyboard controls
		document.addEventListener('keydown', this.keyDownHandler);
	}

	onClose() {
		clearInterval(this.gameLoop);
		document.removeEventListener('keydown', this.keyDownHandler);
		const { contentEl } = this;
		contentEl.empty();
	}

	private update(scoreDiv: HTMLDivElement) {
		if (this.gameOver) {
			clearInterval(this.gameLoop);
			return;
		}

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
		}

		// Check collision with self
		if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
			this.gameOver = true;
		}

		if (!this.gameOver) {
			this.snake.unshift(head);

			// Check if food is eaten
			if (head.x === this.food.x && head.y === this.food.y) {
				this.score += 10;
				scoreDiv.setText(`Score: ${this.score}`);
				this.food = this.generateFood();
			} else {
				this.snake.pop();
			}

			// Clear canvas
			this.ctx.fillStyle = '#fff';
			this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

			// Draw snake
			this.ctx.fillStyle = '#4CAF50';
			this.snake.forEach(segment => {
				this.ctx.fillRect(
					segment.x * this.gridSize,
					segment.y * this.gridSize,
					this.gridSize - 2,
					this.gridSize - 2
				);
			});

			// Draw food
			this.ctx.fillStyle = '#FF5722';
			this.ctx.fillRect(
				this.food.x * this.gridSize,
				this.food.y * this.gridSize,
				this.gridSize - 2,
				this.gridSize - 2
			);
		} else {
			this.ctx.fillStyle = '#000';
			this.ctx.font = '30px Arial';
			this.ctx.fillText('Game Over!', this.canvas.width/2 - 70, this.canvas.height/2);
			this.ctx.fillText(`Score: ${this.score}`, this.canvas.width/2 - 50, this.canvas.height/2 + 40);
		}
	}

	private generateFood(): { x: number, y: number } {
		const x = Math.floor(Math.random() * (this.canvas.width / this.gridSize));
		const y = Math.floor(Math.random() * (this.canvas.height / this.gridSize));
		return { x, y };
	}
}
