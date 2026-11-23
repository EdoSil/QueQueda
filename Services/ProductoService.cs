
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace QueQueda.Client.Services;

public class ProductoService
{
    private readonly HttpClient _http;

    public ProductoService(HttpClient http)
    {
        _http = http;
    }

    // CONSULTAR CATÁLOGO
    public async Task<List<ProductoDto>> ObtenerProductosAsync()
    {
        var respuesta = await _http.GetFromJsonAsync<RespuestaProductos>(
            "api/productos"
        );

        if (respuesta == null || respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                "No fue posible obtener los productos."
            );
        }

        return respuesta.Productos ?? new List<ProductoDto>();
    }

    // REGISTRAR PRODUCTO
    public async Task<ProductoDto> CrearProductoAsync(ProductoDto producto)
    {
        using var respuestaHttp = await _http.PostAsJsonAsync(
            "api/productos",
            producto
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaProducto>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK" ||
            respuesta.Producto == null)
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible registrar el producto."
            );
        }

        return respuesta.Producto;
    }

    // ACTUALIZAR PRODUCTO
    public async Task ActualizarProductoAsync(ProductoDto producto)
    {
        using var respuestaHttp = await _http.PutAsJsonAsync(
            $"api/productos/{producto.IdProducto}",
            producto
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<RespuestaGenerica>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta == null ||
            respuesta.Status != "OK")
        {
            throw new InvalidOperationException(
                respuesta?.Message ?? "No fue posible actualizar el producto."
            );
        }
    }


    // ELIMINAR PRODUCTO
    public async Task EliminarProductoAsync(int idProducto)
    {
        if (idProducto <= 0)
            throw new ArgumentException("El identificador no es válido.");

        using var respuestaHttp = await _http.DeleteAsync(
            $"api/productos/{idProducto}"
        );

        var respuesta = await respuestaHttp.Content
            .ReadFromJsonAsync<System.Text.Json.JsonElement>();

        if (!respuestaHttp.IsSuccessStatusCode ||
            respuesta.ValueKind == System.Text.Json.JsonValueKind.Undefined ||
            !respuesta.TryGetProperty("status", out var estado) ||
            estado.GetString() != "OK")
        {
            var mensajes = new List<string>();

            if (respuesta.ValueKind == System.Text.Json.JsonValueKind.Object &&
                respuesta.TryGetProperty("message", out var mensaje))
            {
                mensajes.Add(mensaje.GetString() ?? "No fue posible eliminar el producto.");
            }

            if (respuesta.ValueKind == System.Text.Json.JsonValueKind.Object &&
                respuesta.TryGetProperty("detalles", out var detalles) &&
                detalles.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var detalle in detalles.EnumerateArray())
                {
                    var texto = detalle.GetString();

                    if (!string.IsNullOrWhiteSpace(texto))
                        mensajes.Add(texto);
                }
            }

            throw new InvalidOperationException(
                string.Join(Environment.NewLine, mensajes)
            );
        }
    }


    // RESPUESTAS INTERNAS DE LA API

    private class RespuestaProductos
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("productos")]
        public List<ProductoDto>? Productos { get; set; }
    }

    private class RespuestaProducto
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        [JsonPropertyName("producto")]
        public ProductoDto? Producto { get; set; }
    }

    private class RespuestaGenerica
    {
        [JsonPropertyName("status")]
        public string? Status { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }
}

// DTO DEL PRODUCTO
public class ProductoDto
{
    [JsonPropertyName("id_producto")]
    public int IdProducto { get; set; }

    [JsonPropertyName("nombre")]
    public string Nombre { get; set; } = string.Empty;

    [JsonPropertyName("categoria")]
    public string? Categoria { get; set; }

    [JsonPropertyName("cantidad")]
    public decimal Cantidad { get; set; }

    [JsonPropertyName("unidad_medida")]
    public string UnidadMedida { get; set; } = string.Empty;
}
