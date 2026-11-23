
window.qqChat = {
    voiceRecognition: null,
    audioStream: null,
    audioContext: null,
    audioAnalyser: null,
    audioFrame: null,
    ultimaActualizacionAudio: 0,

    getOrCreateSessionId: function () {
        const clave = "qq_chat_session_id";
        let sessionId = localStorage.getItem(clave);

        if (!sessionId) {
            sessionId = crypto.randomUUID();
            localStorage.setItem(clave, sessionId);
        }

        return sessionId;
    },

    scrollToBottom: function (element) {
        const chat = element?.closest(".qq-chat");

        if (chat) {
            chat.scrollTo({
                top: chat.scrollHeight,
                behavior: "smooth"
            });
        }
    },


    iniciarMedidorAudio: function (dotNetReference) {
        const analyser = window.qqChat.audioAnalyser;
        const data = new Uint8Array(analyser.fftSize);

        let vozDetectada = false;
        let ultimaActividadVoz = 0;
        let reconocimientoDetenido = false;

        function medirAudio(timestamp) {
            if (!window.qqChat.audioAnalyser) return;

            analyser.getByteTimeDomainData(data);

            let suma = 0;

            for (let i = 0; i < data.length; i++) {
                const muestra = (data[i] - 128) / 128;
                suma += muestra * muestra;
            }

            const rms = Math.sqrt(suma / data.length);
            const nivel = Math.min(100, Math.round(rms * 500));

            // Detectar actividad de voz.
            if (nivel > 5) {
                vozDetectada = true;
                ultimaActividadVoz = Date.now();
            }

            // Detener después de 1,5 segundos de silencio.
            if (
                vozDetectada &&
                !reconocimientoDetenido &&
                Date.now() - ultimaActividadVoz >= 1500
            ) {
                reconocimientoDetenido = true;

                if (window.qqChat.voiceRecognition) {
                    window.qqChat.voiceRecognition.stop();
                }

                return;
            }

            if (timestamp - window.qqChat.ultimaActualizacionAudio > 150) {
                window.qqChat.ultimaActualizacionAudio = timestamp;

                dotNetReference.invokeMethodAsync(
                    "ActualizarNivelAudio",
                    nivel
                ).catch(() => {});
            }

            window.qqChat.audioFrame =
                requestAnimationFrame(medirAudio);
        }

        window.qqChat.audioFrame =
            requestAnimationFrame(medirAudio);
    },


    detenerMedidorAudio: function (dotNetReference) {
        if (window.qqChat.audioFrame) {
            cancelAnimationFrame(window.qqChat.audioFrame);
            window.qqChat.audioFrame = null;
        }

        if (window.qqChat.audioStream) {
            window.qqChat.audioStream.getTracks().forEach(track => track.stop());
            window.qqChat.audioStream = null;
        }

        if (window.qqChat.audioContext) {
            window.qqChat.audioContext.close();
            window.qqChat.audioContext = null;
        }

        window.qqChat.audioAnalyser = null;

        if (dotNetReference) {
            dotNetReference.invokeMethodAsync(
                "ActualizarNivelAudio",
                0
            ).catch(() => {});
        }
    },

    startVoiceRecognition: async function (dotNetReference) {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) return false;

        if (window.qqChat.voiceRecognition) {
            window.qqChat.stopVoiceRecognition();
        }

        try {
            // Capturar el micrófono predeterminado del navegador.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });

            window.qqChat.audioStream = stream;

            // Preparar el analizador de audio.
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();

            analyser.fftSize = 512;
            source.connect(analyser);

            window.qqChat.audioContext = audioContext;
            window.qqChat.audioAnalyser = analyser;

            if (audioContext.state === "suspended") {
                await audioContext.resume();
            }

            window.qqChat.iniciarMedidorAudio(dotNetReference);

            // Iniciar reconocimiento de voz.
            const recognition = new SpeechRecognition();

            recognition.lang = "es-CL";
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            let resultadoRecibido = false;

            let ultimaActividadVoz = 0;
            let vozDetectada = false;
            let temporizadorPausa = null;

            recognition.onresult = function (event) {
                const transcripcion = event.results[0][0].transcript;
                resultadoRecibido = true;

                dotNetReference.invokeMethodAsync(
                    "RecibirTextoVoz",
                    transcripcion
                );
            };

            recognition.onerror = function (event) {
                console.error("Error SpeechRecognition:", event.error);

                dotNetReference.invokeMethodAsync(
                    "ErrorReconocimientoVoz",
                    event.error
                );
            };

            recognition.onend = function () {
                window.qqChat.voiceRecognition = null;

                window.qqChat.detenerMedidorAudio(dotNetReference);

                if (!resultadoRecibido && !recognition.detenidoManualmente) {
                    console.warn("Reconocimiento terminado sin transcripción.");
                }
            };

            window.qqChat.voiceRecognition = recognition;
            recognition.start();

            return true;
        }
        catch (error) {
            console.error("Error al iniciar el micrófono:", error);

            window.qqChat.voiceRecognition = null;
            window.qqChat.detenerMedidorAudio(dotNetReference);

            return false;
        }
    },

    stopVoiceRecognition: function () {
        const recognition = window.qqChat.voiceRecognition;

        if (recognition) {
            recognition.detenidoManualmente = true;
            window.qqChat.voiceRecognition = null;
            recognition.stop();
        }

        window.qqChat.detenerMedidorAudio(null);
    }
};
