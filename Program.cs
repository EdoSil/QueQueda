
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using QueQueda.Client;
using QueQueda.Client.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

// Registra el componente principal de la aplicación Blazor.
builder.RootComponents.Add<App>("#app");

// Permite utilizar componentes que necesitan contenido en el encabezado HTML.
builder.RootComponents.Add<HeadOutlet>("head::after");

// Dirección base de la API publicada de ¿Qué Queda?.
// Las solicitudes HTTP del cliente utilizarán esta dirección.
var direccionApi = "https://quequeda.singlartec.com/api-test/";

// Registra HttpClient para que los componentes puedan comunicarse con la API.
builder.Services.AddScoped(sp => new HttpClient
{
    BaseAddress = new Uri(direccionApi)
});

// Registra el servicio de autenticación compartido por todas las pantallas.
builder.Services.AddScoped<AuthService>();

// Registra el servicio encargado de las operaciones con hogares.
builder.Services.AddScoped<HogarService>();

// Registra el servicio encargado de las operaciones con productos.
builder.Services.AddScoped<ProductoService>();

// Registra el servicio común para buscar y crear productos.
builder.Services.AddScoped<ResolverProductoService>();

// Registra el servicio encargado de las operaciones con el inventario.
builder.Services.AddScoped<InventarioService>();

//Registra el servicio encargado de las operaciones con las listas de compra.
builder.Services.AddScoped<ListaCompraService>();

// Construye e inicia la aplicación Blazor WebAssembly.
await builder.Build().RunAsync();
