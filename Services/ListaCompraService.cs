using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace QueQueda.Client.Services;

public class ListaCompraService
{
    private readonly HttpClient _http;

    public ListaCompraService(HttpClient http)
    {
        _http = http;
    }

    public async Task<List<ListaCompraDto>> ObtenerListasAsync(int idHogar)
    {
        using var http = await _http.GetAsync($"api/listas-compra?id_hogar={idHogar}");
        var r = await http.Content.ReadFromJsonAsync<RespuestaListasDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible consultar las listas.");
        return r?.Listas ?? new();
    }

    public async Task<int> CrearListaAsync(int idHogar, string nombre)
    {
        using var http = await _http.PostAsJsonAsync("api/listas-compra", new
        {
            id_hogar = idHogar,
            nombre
        });
        var r = await http.Content.ReadFromJsonAsync<RespuestaCrearListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible crear la lista.");
        return r!.IdLista;
    }

    public async Task<ListaCompraDetalleRespuestaDto> ObtenerListaAsync(int idLista)
    {
        using var http = await _http.GetAsync($"api/listas-compra/{idLista}");
        var r = await http.Content.ReadFromJsonAsync<ListaCompraDetalleRespuestaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible consultar el detalle de la lista.");
        return r!;
    }

    public async Task AgregarProductoAsync(int idLista, int idProducto, decimal cantidad)
    {
        using var http = await _http.PostAsJsonAsync($"api/listas-compra/{idLista}/detalles", new
        {
            id_producto = idProducto,
            cantidad
        });
        var r = await http.Content.ReadFromJsonAsync<RespuestaOperacionListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible agregar el producto.");
    }

    public async Task ActualizarCantidadAsync(int idDetalle, decimal cantidad)
    {
        using var http = await _http.PutAsJsonAsync($"api/listas-compra/detalles/{idDetalle}", new
        {
            cantidad
        });
        var r = await http.Content.ReadFromJsonAsync<RespuestaOperacionListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible actualizar la cantidad.");
    }

    public async Task RetirarProductoAsync(int idDetalle)
    {
        using var http = await _http.DeleteAsync($"api/listas-compra/detalles/{idDetalle}");
        var r = await http.Content.ReadFromJsonAsync<RespuestaOperacionListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible retirar el producto.");
    }

    public async Task<ResultadoGenerarListaDto> GenerarDesdeInventarioAsync(int idHogar)
    {
        using var http = await _http.GetAsync($"api/listas-compra/generar?id_hogar={idHogar}");
        var r = await http.Content.ReadFromJsonAsync<ResultadoGenerarListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible generar la lista.");
        return r!;
    }

    public async Task ConfirmarCompraAsync(int idDetalle, decimal cantidad)
    {
        using var http = await _http.PostAsJsonAsync($"api/listas-compra/detalles/{idDetalle}/comprar", new
        {
            cantidad
        });
        var r = await http.Content.ReadFromJsonAsync<RespuestaOperacionListaDto>();
        Validar(http.IsSuccessStatusCode, r?.Status, r?.Message, "No fue posible confirmar la compra.");
    }

    public async Task<List<MovimientoCompraDto>> ObtenerMovimientosAsync(int idHogar)
    {
        using var http = await _http.GetAsync(
            $"api/movimientos?id_hogar={idHogar}");

        var r = await http.Content.ReadFromJsonAsync<RespuestaMovimientosDto>();

        Validar(
            http.IsSuccessStatusCode,
            r?.Status,
            r?.Message,
            "No fue posible consultar el historial de compras.");

        return r?.Movimientos ?? new();
    }

    private static void Validar(bool correcto, string? status, string? message, string mensajeAlternativo)
    {
        if (!correcto || status != "OK")
            throw new InvalidOperationException(message ?? mensajeAlternativo);
    }


    public async Task EliminarListaAsync(int idLista)
    {
        using var http = await _http.DeleteAsync($"api/listas-compra/{idLista}");
        var r = await http.Content.ReadFromJsonAsync<RespuestaOperacionListaDto>();

        Validar(
            http.IsSuccessStatusCode,
            r?.Status,
            r?.Message,
            "No fue posible eliminar la lista."
        );
    }

    public async Task EliminarMovimientoAsync(int idMovimiento)
    {
        if (idMovimiento <= 0)
        {
            throw new ArgumentException(
                "El identificador del movimiento no es válido."
            );
        }

        using var respuesta = await _http.DeleteAsync(
            $"api/movimientos/{idMovimiento}"
        );

        respuesta.EnsureSuccessStatusCode();
    }


}

public class ListaCompraDto
{
    [JsonPropertyName("id_lista")] public int IdLista { get; set; }
    [JsonPropertyName("id_hogar")] public int IdHogar { get; set; }
    [JsonPropertyName("id_usuario")] public int IdUsuario { get; set; }
    [JsonPropertyName("nombre")] public string Nombre { get; set; } = "";
    [JsonPropertyName("estado")] public string Estado { get; set; } = "";
    [JsonPropertyName("total_productos")] public int TotalProductos { get; set; }
    [JsonPropertyName("productos_comprados")] public int ProductosComprados { get; set; }
}

public class ListaCompraProductoDto
{
    [JsonPropertyName("id_detalle")] public int IdDetalle { get; set; }
    [JsonPropertyName("id_lista")] public int IdLista { get; set; }
    [JsonPropertyName("id_producto")] public int IdProducto { get; set; }
    [JsonPropertyName("nombre")] public string Nombre { get; set; } = "";
    [JsonPropertyName("categoria")] public string? Categoria { get; set; }
    [JsonPropertyName("unidad_medida")] public string? UnidadMedida { get; set; }
    [JsonPropertyName("cantidad")] public decimal Cantidad { get; set; }
    [JsonPropertyName("comprado")] public int Comprado { get; set; }
    [JsonPropertyName("id_usuario_compra")] public int? IdUsuarioCompra { get; set; }
    [JsonPropertyName("nombre_comprador")] public string? NombreComprador { get; set; }
}

public class RespuestaListasDto
{
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("listas")] public List<ListaCompraDto>? Listas { get; set; }
}

public class RespuestaCrearListaDto
{
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("id_lista")] public int IdLista { get; set; }
}

public class ListaCompraDetalleRespuestaDto
{
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("lista")] public ListaCompraDto? Lista { get; set; }
    [JsonPropertyName("productos")] public List<ListaCompraProductoDto>? Productos { get; set; }
}

public class RespuestaOperacionListaDto
{
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("mensaje")] public string? Mensaje { get; set; }
}

public class ResultadoGenerarListaDto
{
    [JsonPropertyName("status")] public string? Status { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("mensaje")] public string? Mensaje { get; set; }
    [JsonPropertyName("id_lista")] public int? IdLista { get; set; }
    [JsonPropertyName("total_productos")] public int TotalProductos { get; set; }
}


public class MovimientoCompraDto
{
    [JsonPropertyName("id_movimiento")]
    public int IdMovimiento { get; set; }

    [JsonPropertyName("id_usuario")]
    public int IdUsuario { get; set; }

    [JsonPropertyName("nombre_usuario")]
    public string NombreUsuario { get; set; } = "";

    [JsonPropertyName("id_producto")]
    public int IdProducto { get; set; }

    [JsonPropertyName("nombre_producto")]
    public string NombreProducto { get; set; } = "";

    [JsonPropertyName("tipo_movimiento")]
    public string TipoMovimiento { get; set; } = "";

    [JsonPropertyName("cantidad")]
    public decimal Cantidad { get; set; }

    [JsonPropertyName("fecha")]
    public string Fecha { get; set; } = "";
}

public class RespuestaMovimientosDto
{
    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }

    [JsonPropertyName("movimientos")]
    public List<MovimientoCompraDto>? Movimientos { get; set; }
}
