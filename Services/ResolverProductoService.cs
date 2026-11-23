namespace QueQueda.Client.Services;

public class ResolverProductoService
{
    private readonly ProductoService _productoService;

    public ResolverProductoService(ProductoService productoService)
    {
        _productoService = productoService;
    }

    public async Task<List<ProductoDto>> BuscarAsync(string nombre)
    {
        if (string.IsNullOrWhiteSpace(nombre))
            return new List<ProductoDto>();

        var catalogo = await _productoService.ObtenerProductosAsync();

        return catalogo
            .Where(p => p.Nombre.Contains(
                nombre.Trim(),
                StringComparison.OrdinalIgnoreCase))
            .ToList();
    }

    public async Task<ProductoDto> CrearAsync(
        string nombre,
        string? categoria,
        string unidadMedida)
    {
        if (string.IsNullOrWhiteSpace(nombre))
            throw new ArgumentException("El nombre es obligatorio.");

        if (string.IsNullOrWhiteSpace(unidadMedida))
            throw new ArgumentException("La unidad de medida es obligatoria.");

        var producto = new ProductoDto
        {
            Nombre = nombre.Trim(),
            Categoria = string.IsNullOrWhiteSpace(categoria)
                ? null
                : categoria.Trim(),
            UnidadMedida = unidadMedida.Trim(),
            Cantidad = 1
        };

        return await _productoService.CrearProductoAsync(producto);
    }
}