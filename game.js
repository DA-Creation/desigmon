// 1. 게임 설정 (Config)
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d', // 게임 배경색 (어두운 회색)
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // 탑다운 게임이라 중력 0
            debug: true // 디버그 모드: 충돌 박스가 초록색으로 보임
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// 게임 인스턴스 생성
const game = new Phaser.Game(config);

let player;
let cursors;
let wasd;
let textLog;

// 2. 자원 로드 (지금은 이미지 없이 도형으로 할 거라 비워둠)
function preload() {
    // 나중에 여기에 이미지를 넣을 겁니다.
    // this.load.image('player', 'assets/player.png');
}

// 3. 게임 화면 생성 (Create)
function create() {
    // --- 맵 만들기 (임시) ---
    // 잔디밭 (배경)
    this.add.rectangle(400, 300, 800, 600, 0x4CAF50); 
    
    // 벽/장애물 (갈색 박스)
    const wall = this.add.rectangle(600, 400, 100, 100, 0x795548);
    this.physics.add.existing(wall, true); // true = 움직이지 않는 벽

    // 클라이언트 NPC (빨간 박스)
    const client = this.add.rectangle(200, 200, 40, 40, 0xFF0000);
    this.physics.add.existing(client, true);

    // --- 플레이어 만들기 (파란 박스) ---
    player = this.add.rectangle(400, 300, 32, 32, 0x0000FF);
    this.physics.add.existing(player); // 물리 엔진 적용
    
    // 플레이어 물리 설정
    player.body.setCollideWorldBounds(true); // 화면 밖으로 못 나가게

    // --- 충돌 처리 ---
    // 플레이어와 벽이 부딪히면 멈춤
    this.physics.add.collider(player, wall);

    // 플레이어와 클라이언트가 겹치면 이벤트 발생
    this.physics.add.overlap(player, client, meetClient, null, this);

    // --- 입력 키 설정 ---
    cursors = this.input.keyboard.createCursorKeys(); // 화살표 키
    wasd = this.input.keyboard.addKeys({ // WASD 키
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // --- 상태 메시지 텍스트 ---
    textLog = this.add.text(10, 10, '방향키로 움직여보세요!', { 
        fontSize: '20px', 
        fill: '#ffffff',
        backgroundColor: '#000000'
    });
}

// 4. 매 프레임마다 실행 (Update - 움직임 로직)
function update() {
    // 1. 속도 초기화 (안 누르면 멈춤)
    player.body.setVelocity(0);

    // 2. 키 입력 확인 (화살표 또는 WASD)
    if (cursors.left.isDown || wasd.left.isDown) {
        player.body.setVelocityX(-200);
    } else if (cursors.right.isDown || wasd.right.isDown) {
        player.body.setVelocityX(200);
    }

    if (cursors.up.isDown || wasd.up.isDown) {
        player.body.setVelocityY(-200);
    } else if (cursors.down.isDown || wasd.down.isDown) {
        player.body.setVelocityY(200);
    }
}

// --- 사용자 정의 함수 ---

// 클라이언트를 만났을 때 실행되는 함수
function meetClient(player, client) {
    textLog.setText('야생의 클라이언트가 나타났다!\n(수정 요청을 하려고 한다...)');
    
    // 만났다는 느낌을 주기 위해 빨간색으로 깜빡임 (카메라 효과)
    // this.cameras.main.shake(100); 
}