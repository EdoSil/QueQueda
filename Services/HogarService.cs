
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace QueQueda.Client.Services;

/// <summary>
/// Servicio encargado de realizar las operaciones de comunicación
/// con la API relacionadas con hogares, integrantes e invitaciones.
/// </summary>
public class HogarService
{
    private readonly HttpClient _http;

    public HogarService(HttpClient http)
    {
        _http = http;
    }

    /// <summary>
    /// Obtiene los hogares asociados al usuario autenticado.
    /// </summary>
    public async Task<List<HogarDto>> ObtenerHogaresAsync()
    {
        var respuesta = await _http.GetFromJsonAsync<RespuestaHogares>(
            "api/hogares"
        );

        if (respuesta == null || respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                "No fue posible obtener los hogares."
            );
        }

        return respuesta.Hogares ?? new List<HogarDto>();
    }

    /// <summary>
    /// Obtiene los integrantes asociados a un hogar.
    /// </summary>
    public async Task<List<IntegranteDto>> ObtenerIntegrantesAsync(
        int idHogar
    )
    {
        if (idHogar <= 0)
        {
            throw new ArgumentException(
                "El identificador del hogar no es válido."
            );
        }

        var respuesta = await _http.GetFromJsonAsync<RespuestaIntegrantes>(
            $"api/hogares/integrantes?id_hogar={idHogar}"
        );

        if (respuesta == null || respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                "No fue posible obtener los integrantes del hogar."
            );
        }

        return respuesta.Integrantes ?? new List<IntegranteDto>();
    }

    /// <summary>
    /// Crea un hogar y asigna al usuario autenticado como administrador.
    /// </summary>
    public async Task<HogarDto> CrearHogarAsync(string nombre)
    {
        if (string.IsNullOrWhiteSpace(nombre) || nombre.Trim().Length > 100)
        {
            throw new ArgumentException(
                "El nombre debe tener entre 1 y 100 caracteres."
            );
        }

        using var respuestaHttp = await _http.PostAsJsonAsync(
            "api/hogares",
            new { nombre = nombre.Trim() }
        );

        respuestaHttp.EnsureSuccessStatusCode();

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaCrearHogar>();

        if (respuesta == null ||
            respuesta.Status != "OK" ||
            respuesta.Hogar == null)
        {
            throw new InvalidOperationException(
                "No fue posible crear el hogar."
            );
        }

        return respuesta.Hogar;
    }

    /// <summary>
    /// Genera una invitación para incorporar una persona a un hogar.
    /// El usuario autenticado debe ser administrador.
    /// </summary>
    public async Task<InvitacionDto> CrearInvitacionAsync(int idHogar)
    {
        if (idHogar <= 0)
        {
            throw new ArgumentException(
                "El identificador del hogar no es válido."
            );
        }

        using var respuestaHttp = await _http.PostAsJsonAsync(
            "api/hogares/invitaciones",
            new { id_hogar = idHogar }
        );

        respuestaHttp.EnsureSuccessStatusCode();

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaCrearInvitacion>();

        if (respuesta == null ||
            respuesta.Status != "OK" ||
            respuesta.Invitacion == null ||
            string.IsNullOrWhiteSpace(respuesta.Invitacion.Codigo))
        {
            throw new InvalidOperationException(
                "No fue posible generar la invitación."
            );
        }

        return respuesta.Invitacion;
    }

    /// <summary>
    /// Consulta una invitación sin aceptarla.
    /// No requiere autenticación.
    /// </summary>
    public async Task<InvitacionConsultaDto> ConsultarInvitacionAsync(
        string codigo
    )
    {
        if (string.IsNullOrWhiteSpace(codigo))
        {
            throw new ArgumentException(
                "El código de invitación es obligatorio."
            );
        }

        // Codificar el código para incorporarlo a la URL.
        var codigoSeguro = Uri.EscapeDataString(codigo.Trim());

        // Consultar la invitación en la API.
        using var respuestaHttp = await _http.GetAsync(
            $"api/hogares/invitaciones/consultar?codigo={codigoSeguro}"
        );

        // Leer la respuesta incluso cuando la API devuelve un error.
        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaConsultarInvitacion>();

        if (respuesta == null)
        {
            throw new InvalidOperationException(
                "No fue posible consultar la invitación."
            );
        }

        // Comprobar que la invitación sea válida.
        if (respuesta.Status != "OK" || respuesta.Invitacion == null)
        {
            throw new InvalidOperationException(
                respuesta.Message ?? "La invitación no es válida."
            );
        }

        return respuesta.Invitacion;
    }

    /// <summary>
    /// Acepta una invitación y asocia al usuario autenticado
    /// con el hogar correspondiente.
    /// </summary>
   
    public async Task<ResultadoAceptarInvitacionDto> AceptarInvitacionAsync(
        string codigo
    )
    {
        if (string.IsNullOrWhiteSpace(codigo))
        {
            throw new ArgumentException(
                "El código de invitación es obligatorio."
            );
        }

        using var respuestaHttp = await _http.PostAsJsonAsync(
            "api/hogares/invitaciones/aceptar",
            new { codigo = codigo.Trim() }
        );

        var contenido = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaAceptarInvitacion>();

        if (contenido == null)
        {
            throw new InvalidOperationException(
                "No fue posible procesar la invitación."
            );
        }

        if (respuestaHttp.StatusCode ==
            System.Net.HttpStatusCode.Conflict)
        {
            if (contenido.Message == "Ya perteneces a este hogar")
            {
                return new ResultadoAceptarInvitacionDto
                {
                    Status = "OK",
                    Mensaje = "Ya perteneces a este hogar",
                    IdHogar = contenido.IdHogar
                };
            }

            throw new InvalidOperationException(
                contenido.Message ?? "La invitación presenta un conflicto."
            );
        }

        if (!respuestaHttp.IsSuccessStatusCode ||
            contenido.Status != "OK")
        {
            throw new InvalidOperationException(
                contenido.Message ??
                "No fue posible aceptar la invitación."
            );
        }

        return new ResultadoAceptarInvitacionDto
        {
            Status = contenido.Status,
            Mensaje = contenido.Mensaje,
            IdHogar = contenido.IdHogar
        };
    }



    /// <summary>
    /// Representa la respuesta de la consulta de hogares.
    /// </summary>
    private class RespuestaHogares
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("hogares")]
        public List<HogarDto>? Hogares { get; set; }
    }

    /// <summary>
    /// Representa la respuesta de la consulta de integrantes.
    /// </summary>
    private class RespuestaIntegrantes
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("integrantes")]
        public List<IntegranteDto>? Integrantes { get; set; }
    }

    /// <summary>
    /// Representa la respuesta de creación de un hogar.
    /// </summary>
    private class RespuestaCrearHogar
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("hogar")]
        public HogarDto? Hogar { get; set; }
    }

    /// <summary>
    /// Representa la respuesta de generación de una invitación.
    /// </summary>
    private class RespuestaCrearInvitacion
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("invitacion")]
        public InvitacionDto? Invitacion { get; set; }
    }

    /// <summary>
    /// Representa la respuesta de consulta de una invitación.
    /// </summary>
    private class RespuestaConsultarInvitacion
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("invitacion")]
        public InvitacionConsultaDto? Invitacion { get; set; }
    }

    /// <summary>
    /// Representa el resultado procesado de aceptar una invitación
    /// que utiliza la aplicación cliente.
    /// </summary>
    private class RespuestaAceptarInvitacion
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("mensaje")]
        public string? Mensaje { get; set; }

        [JsonPropertyName("id_hogar")]
        public int IdHogar { get; set; }
    }



}

/// <summary>
/// Representa los datos de un hogar recibidos desde la API.
/// </summary>
public class HogarDto
{
    [JsonPropertyName("id_hogar")]
    public int IdHogar { get; set; }

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonPropertyName("fecha_creacion")]
    public string? FechaCreacion { get; set; }

    [JsonPropertyName("perfil")]
    public string Perfil { get; set; } = string.Empty;
}

/// <summary>
/// Representa a una persona que pertenece a un hogar.
/// </summary>
public class IntegranteDto
{
    [JsonPropertyName("id_usuario")]
    public int IdUsuario { get; set; }

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonPropertyName("correo")]
    public string Correo { get; set; } = string.Empty;

    [JsonPropertyName("perfil")]
    public string Perfil { get; set; } = string.Empty;
}

/// <summary>
/// Representa una invitación generada por la API.
/// </summary>
public class InvitacionDto
{
    [JsonPropertyName("id_invitacion")]
    public int IdInvitacion { get; set; }

    [JsonPropertyName("codigo")]
    public string Codigo { get; set; } = string.Empty;

    [JsonPropertyName("expira_en")]
    public string ExpiraEn { get; set; } = string.Empty;

    [JsonPropertyName("validez_horas")]
    public int ValidezHoras { get; set; }
}

/// <summary>
/// Representa los datos públicos de una invitación consultada.
/// </summary>
public class InvitacionConsultaDto
{
    [JsonPropertyName("id_hogar")]
    public int IdHogar { get; set; }

    [JsonPropertyName("nombre_hogar")]
    public string NombreHogar { get; set; } = string.Empty;

    [JsonPropertyName("estado")]
    public string Estado { get; set; } = string.Empty;

    [JsonPropertyName("vigente")]
    public bool Vigente { get; set; }

    [JsonPropertyName("fecha_expiracion")]
    public string? FechaExpiracion { get; set; }
}

/// <summary>
/// Representa el resultado de aceptar una invitación.
/// </summary>
public class ResultadoAceptarInvitacionDto
{
    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("mensaje")]
    public string? Mensaje { get; set; }

    [JsonPropertyName("id_hogar")]
    public int IdHogar { get; set; }
}

