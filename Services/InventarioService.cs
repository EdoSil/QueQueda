
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace QueQueda.Client.Services;

/// <summary>
/// Servicio encargado de las operaciones de inventario.
/// </summary>
public class InventarioService
{
    private readonly HttpClient _http;

    public InventarioService(HttpClient http)
    {
        _http = http;
    }

    /// <summary>
    /// Consulta el inventario de un hogar.
    /// </summary>
    public async Task<List<InventarioDto>> ObtenerInventarioAsync(int idHogar)
    {
        if (idHogar <= 0)
            throw new ArgumentException("El identificador del hogar no es válido.");

        using var respuestaHttp = await _http.GetAsync(
            $"api/inventario?id_hogar={idHogar}"
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaInventario>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible obtener el inventario."
            );
        }

        return respuesta.Inventario ?? new List<InventarioDto>();
    }

    /// <summary>
    /// Incorpora un producto al inventario de un hogar.
    /// </summary>
    public async Task IncorporarProductoAsync(
        int idHogar,
        int idProducto,
        decimal cantidadActual,
        decimal cantidadMinima)
    {
        if (idHogar <= 0 || idProducto <= 0)
            throw new ArgumentException("Los identificadores no son válidos.");

        if (cantidadActual < 0 || cantidadMinima < 0)
            throw new ArgumentException("Las cantidades no pueden ser negativas.");

        using var respuestaHttp = await _http.PostAsJsonAsync(
            "api/inventario",
            new
            {
                id_hogar = idHogar,
                id_producto = idProducto,
                cantidad_actual = cantidadActual,
                cantidad_minima = cantidadMinima
            }
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaOperacion>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible incorporar el producto."
            );
        }
    }

    /// <summary>
    /// Actualiza las cantidades de un producto del inventario.
    /// </summary>
    public async Task ActualizarProductoAsync(
        int idInventario,
        decimal cantidadActual,
        decimal cantidadMinima)
    {
        if (idInventario <= 0)
            throw new ArgumentException("El identificador no es válido.");

        if (cantidadActual < 0 || cantidadMinima < 0)
            throw new ArgumentException("Las cantidades no pueden ser negativas.");

        using var respuestaHttp = await _http.PutAsJsonAsync(
            $"api/inventario/{idInventario}",
            new
            {
                cantidad_actual = cantidadActual,
                cantidad_minima = cantidadMinima
            }
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaOperacion>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible actualizar el inventario."
            );
        }
    }

    /// <summary>
    /// Retira un producto del inventario, sin eliminarlo del catálogo.
    /// </summary>
    public async Task RetirarProductoAsync(int idInventario)
    {
        if (idInventario <= 0)
            throw new ArgumentException("El identificador no es válido.");

        using var respuestaHttp = await _http.DeleteAsync(
            $"api/inventario/{idInventario}"
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaOperacion>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible retirar el producto."
            );
        }
    }

    private class RespuestaInventario
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("inventario")]
        public List<InventarioDto>? Inventario { get; set; }
    }

    private class RespuestaOperacion
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("id_inventario")]
        public int IdInventario { get; set; }
    }
}

/// <summary>
/// Representa un producto incorporado al inventario de un hogar.
/// </summary>
public class InventarioDto
{
    [JsonPropertyName("id_inventario")]
    public int IdInventario { get; set; }

    [JsonPropertyName("id_hogar")]
    public int IdHogar { get; set; }

    [JsonPropertyName("id_producto")]
    public int IdProducto { get; set; }

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonPropertyName("categoria")]
    public string? Categoria { get; set; }

    [JsonPropertyName("unidad_medida")]
    public string? UnidadMedida { get; set; }

    [JsonPropertyName("cantidad_actual")]
    public decimal CantidadActual { get; set; }

    [JsonPropertyName("cantidad_minima")]
    public decimal CantidadMinima { get; set; }

    [JsonPropertyName("estado")]
    public string Estado { get; set; } = string.Empty;
}
