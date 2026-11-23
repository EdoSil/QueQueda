
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.JSInterop;

namespace QueQueda.Client.Services;

public class AuthService
{
    private const string ClaveToken = "quequeda_token";
    private const string ClaveNombre = "quequeda_nombre";
    private const string ClaveIdHogarActivo = "quequeda_id_hogar_activo";
    private const string ClaveNombreHogarActivo = "quequeda_nombre_hogar_activo";

    private readonly HttpClient _http;
    private readonly IJSRuntime _js;

    public bool SesionActiva { get; private set; }
    public bool Inicializado { get; private set; }
    public string Correo { get; private set; } = string.Empty;
    public string Nombre { get; private set; } = string.Empty;

    // Hogar seleccionado para la sesión actual.
    public int? IdHogarActivo { get; private set; }
    public string NombreHogarActivo { get; private set; } = string.Empty;

    public event Action? OnChange;

    public AuthService(HttpClient http, IJSRuntime js)
    {
        _http = http;
        _js = js;
    }

    public async Task InicializarAsync()
    {
        if (Inicializado)
        {
            return;
        }

        try
        {
            var token = await _js.InvokeAsync<string?>(
                "sessionStorage.getItem",
                ClaveToken
            );

            var nombreGuardado = await _js.InvokeAsync<string?>(
                "sessionStorage.getItem",
                ClaveNombre
            );

            var idHogarGuardado = await _js.InvokeAsync<string?>(
                "sessionStorage.getItem",
                ClaveIdHogarActivo
            );

            var nombreHogarGuardado = await _js.InvokeAsync<string?>(
                "sessionStorage.getItem",
                ClaveNombreHogarActivo
            );

            if (string.IsNullOrWhiteSpace(token))
            {
                RestablecerEstado();
                return;
            }

            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            using var respuesta = await _http.GetAsync(
                "api/usuarios/verificar-token"
            );

            Console.WriteLine(
                $"[AUTH] Estado HTTP de verificar-token: {(int)respuesta.StatusCode}"
            );

            if (!respuesta.IsSuccessStatusCode)
            {
                await LimpiarSesionLocalAsync();
                return;
            }

            var contenido = await respuesta.Content.ReadAsStringAsync();

            using var documento = JsonDocument.Parse(contenido);
            var raiz = documento.RootElement;

            var estadoCorrecto =
                raiz.TryGetProperty("status", out var estado)
                && estado.GetString() == "OK";

            var tieneUsuario =
                raiz.TryGetProperty("usuario", out var usuario)
                && usuario.ValueKind == JsonValueKind.Object;

            if (!estadoCorrecto || !tieneUsuario)
            {
                await LimpiarSesionLocalAsync();
                return;
            }

            if (usuario.TryGetProperty("correo", out var correoJson)
                && correoJson.ValueKind == JsonValueKind.String)
            {
                Correo = correoJson.GetString() ?? string.Empty;
            }

            var nombreApi = LeerNombre(usuario);

            Nombre = !string.IsNullOrWhiteSpace(nombreApi)
                ? nombreApi
                : nombreGuardado ?? string.Empty;

            if (!string.IsNullOrWhiteSpace(nombreApi))
            {
                await _js.InvokeVoidAsync(
                    "sessionStorage.setItem",
                    ClaveNombre,
                    nombreApi
                );
            }

            // Recuperar el hogar activo de la sesión.
            if (int.TryParse(idHogarGuardado, out var idHogar)
                && idHogar > 0)
            {
                IdHogarActivo = idHogar;
                NombreHogarActivo = nombreHogarGuardado ?? string.Empty;
            }
            else
            {
                IdHogarActivo = null;
                NombreHogarActivo = string.Empty;
            }

            SesionActiva = true;

            Console.WriteLine(
                $"[AUTH] SesionActiva después de validar: {SesionActiva}"
            );

            Console.WriteLine(
                $"[AUTH] Hogar activo: {IdHogarActivo}"
            );
        }
        catch (HttpRequestException ex)
        {
            Console.WriteLine($"[AUTH] Error HTTP: {ex.Message}");
            SesionActiva = false;
        }
        catch (JsonException ex)
        {
            Console.WriteLine($"[AUTH] Error JSON: {ex.Message}");
            await LimpiarSesionLocalAsync();
        }
        catch (JSException ex)
        {
            Console.WriteLine($"[AUTH] Error del navegador: {ex.Message}");
            SesionActiva = false;
        }
        finally
        {
            Inicializado = true;
            NotificarCambio();
        }
    }

    public async Task EstablecerSesionAsync(
        string token,
        string nombre
    )
    {
        // Evitar reutilizar el hogar de una sesión anterior.
        await LimpiarHogarActivoAsync();

        await _js.InvokeVoidAsync(
            "sessionStorage.setItem",
            ClaveToken,
            token
        );

        Nombre = nombre?.Trim() ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(Nombre))
        {
            await _js.InvokeVoidAsync(
                "sessionStorage.setItem",
                ClaveNombre,
                Nombre
            );
        }
        else
        {
            await _js.InvokeVoidAsync(
                "sessionStorage.removeItem",
                ClaveNombre
            );
        }

        Inicializado = false;
        await InicializarAsync();
    }

    // Guardar el hogar elegido por el usuario.
    public async Task EstablecerHogarActivoAsync(
        int idHogar,
        string nombreHogar
    )
    {
        if (idHogar <= 0)
        {
            throw new ArgumentException(
                "El identificador del hogar no es válido."
            );
        }

        if (string.IsNullOrWhiteSpace(nombreHogar))
        {
            throw new ArgumentException(
                "El nombre del hogar es obligatorio."
            );
        }

        await _js.InvokeVoidAsync(
            "sessionStorage.setItem",
            ClaveIdHogarActivo,
            idHogar.ToString()
        );

        await _js.InvokeVoidAsync(
            "sessionStorage.setItem",
            ClaveNombreHogarActivo,
            nombreHogar.Trim()
        );

        IdHogarActivo = idHogar;
        NombreHogarActivo = nombreHogar.Trim();

        NotificarCambio();

        Console.WriteLine(
            $"[AUTH] Hogar activo establecido: {IdHogarActivo}"
        );
    }

    // Eliminar el hogar activo sin cerrar la sesión del usuario.
    public async Task LimpiarHogarActivoAsync()
    {
        await _js.InvokeVoidAsync(
            "sessionStorage.removeItem",
            ClaveIdHogarActivo
        );

        await _js.InvokeVoidAsync(
            "sessionStorage.removeItem",
            ClaveNombreHogarActivo
        );

        IdHogarActivo = null;
        NombreHogarActivo = string.Empty;
    }

    public async Task CerrarSesionAsync()
    {
        await _js.InvokeVoidAsync(
            "sessionStorage.removeItem",
            ClaveToken
        );

        await _js.InvokeVoidAsync(
            "sessionStorage.removeItem",
            ClaveNombre
        );

        await LimpiarHogarActivoAsync();

        _http.DefaultRequestHeaders.Authorization = null;

        RestablecerEstado();
        Inicializado = true;
        NotificarCambio();

        Console.WriteLine("[AUTH] Sesión cerrada.");
    }

    private async Task LimpiarSesionLocalAsync()
    {
        try
        {
            await _js.InvokeVoidAsync(
                "sessionStorage.removeItem",
                ClaveToken
            );

            await _js.InvokeVoidAsync(
                "sessionStorage.removeItem",
                ClaveNombre
            );

            await _js.InvokeVoidAsync(
                "sessionStorage.removeItem",
                ClaveIdHogarActivo
            );

            await _js.InvokeVoidAsync(
                "sessionStorage.removeItem",
                ClaveNombreHogarActivo
            );
        }
        catch (JSException ex)
        {
            Console.WriteLine(
                $"[AUTH] No se pudo limpiar sessionStorage: {ex.Message}"
            );
        }

        _http.DefaultRequestHeaders.Authorization = null;
        RestablecerEstado();
    }

    private void RestablecerEstado()
    {
        SesionActiva = false;
        Correo = string.Empty;
        Nombre = string.Empty;
        IdHogarActivo = null;
        NombreHogarActivo = string.Empty;
    }

    private static string LeerNombre(JsonElement usuario)
    {
        string[] propiedades =
        {
            "nombre",
            "nombre_usuario",
            "nombres",
            "nombre_completo"
        };

        foreach (var propiedad in propiedades)
        {
            if (usuario.TryGetProperty(propiedad, out var valor)
                && valor.ValueKind == JsonValueKind.String)
            {
                var nombre = valor.GetString();

                if (!string.IsNullOrWhiteSpace(nombre))
                {
                    return nombre.Trim();
                }
            }
        }

        return string.Empty;
    }

    private void NotificarCambio()
    {
        Console.WriteLine(
            $"[AUTH] Notificando cambio. SesionActiva={SesionActiva}"
        );

        OnChange?.Invoke();
    }
}
