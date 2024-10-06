let StickStatus = { x: 0, y: 0 };

const JoyStick = (function(container, parameters = {}, callback = function() {}) {
    const {
        title = "joystick",
        width = 0,
        height = 0,
        autoReturnToCenter = true
    } = parameters;

    const objContainer = document.getElementById(container);
    objContainer.style.touchAction = "none";

    const canvas = document.createElement("canvas");
    canvas.id = title;

    const canvasWidth = width || objContainer.clientWidth;
    const canvasHeight = height || objContainer.clientHeight;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    objContainer.appendChild(canvas);

    const context = canvas.getContext("2d");
    const circumference = 2 * Math.PI;
    const internalRadius = (canvasWidth - (canvasWidth / 2 + 10)) / 2;
    const maxMoveStick = internalRadius + 10;
    const externalRadius = internalRadius + 25;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    let movedX = centerX, movedY = centerY, pressed = 0, touchId = null;

    const drawExternal = () => {
        context.beginPath();
        context.arc(centerX, centerY, externalRadius, 0, circumference, false);
        context.fillStyle = '#ffffff50';
        context.fill();
    };

    const drawInternal = () => {
        const limitedPos = limitToCircle(movedX, movedY, centerX, centerY, maxMoveStick);
        movedX = limitedPos.x;
        movedY = limitedPos.y;

        context.beginPath();
        context.arc(movedX, movedY, internalRadius, 0, circumference, false);
        context.fillStyle = '#ffffff';
        context.fill();
    };

    const limitToCircle = (x, y, centerX, centerY, maxRadius) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxRadius) {
            const angle = Math.atan2(dy, dx);
            x = centerX + maxRadius * Math.cos(angle);
            y = centerY + maxRadius * Math.sin(angle);
        }
        return { x, y };
    };

    const updateStickStatus = () => {
        StickStatus.x = (100 * ((movedX - centerX) / maxMoveStick)).toFixed();
        StickStatus.y = ((100 * ((movedY - centerY) / maxMoveStick)) * -1).toFixed();
        callback(StickStatus);
    };

    const handleMovement = (event, pageX, pageY) => {
        movedX = pageX;
        movedY = pageY;

        if (canvas.offsetParent.tagName.toUpperCase() !== "BODY") {
            movedX -= canvas.offsetParent.offsetLeft;
            movedY -= canvas.offsetParent.offsetTop;
        } else {
            movedX -= canvas.offsetLeft;
            movedY -= canvas.offsetTop;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    const onTouchStart = event => {
        pressed = 1;
        touchId = event.targetTouches[0].identifier;
    };

    const onTouchMove = event => {
        if (pressed && event.targetTouches[0].target === canvas) {
            handleMovement(event, event.targetTouches[0].pageX, event.targetTouches[0].pageY);
        }
    };

    const onTouchEnd = event => {
        if (event.changedTouches[0].identifier !== touchId) return;
        pressed = 0;

        if (autoReturnToCenter) {
            movedX = centerX;
            movedY = centerY;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    const onMouseDown = () => { pressed = 1; };

    const onMouseMove = event => {
        if (pressed) {
            handleMovement(event, event.pageX, event.pageY);
        }
    };

    const onMouseUp = () => {
        pressed = 0;
        if (autoReturnToCenter) {
            movedX = centerX;
            movedY = centerY;
        }

        context.clearRect(0, 0, canvas.width, canvas.height);
        drawExternal();
        drawInternal();
        updateStickStatus();
    };

    if ("ontouchstart" in document.documentElement) {
        canvas.addEventListener("touchstart", onTouchStart, false);
        document.addEventListener("touchmove", onTouchMove, false);
        document.addEventListener("touchend", onTouchEnd, false);
    } else {
        canvas.addEventListener("mousedown", onMouseDown, false);
        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);
    }

    drawExternal();
    drawInternal();

    this.GetWidth = () => canvas.width;
    this.GetHeight = () => canvas.height;
    this.GetX = () => (100 * ((movedX - centerX) / maxMoveStick)).toFixed();
    this.GetY = () => ((100 * ((movedY - centerY) / maxMoveStick)) * -1).toFixed();
});
